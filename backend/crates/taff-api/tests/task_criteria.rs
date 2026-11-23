use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use hmac::{Hmac, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::{PgPool, postgres::PgConnectOptions};
use taff_api::{AppState, router};
use taff_db::Db;
use tower::ServiceExt;
use uuid::Uuid;

const FIXTURE_SECRET: &str = "taff-task-criteria-fixture-secret-not-for-production";
const BASE: &str = "/api/task-criteria";
const ORIGIN: &str = "http://localhost:3000";

async fn request(
    app: &Router,
    method: Method,
    path: &str,
    identity: (&str, &str),
    input: Value,
    status: StatusCode,
) -> Value {
    let (user, origin) = identity;
    let mut builder = Request::builder()
        .method(method.clone())
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ORIGIN, origin);
    if user == "agent-bearer" {
        builder = builder.header(header::AUTHORIZATION, "Bearer fixture");
    } else {
        let token = format!("criteria-fixture-{user}");
        let mut signature = Hmac::<Sha256>::new_from_slice(FIXTURE_SECRET.as_bytes()).unwrap();
        signature.update(token.as_bytes());
        let signature = STANDARD.encode(signature.finalize().into_bytes());
        builder = builder.header(
            header::COOKIE,
            format!("better-auth.session_token={token}.{signature}"),
        );
    }
    let request = builder.body(Body::from(input.to_string())).unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let actual = response.status();
    let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
    let result: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(actual, status, "{user} {method} {path}: {result}");
    result
}

#[tokio::test]
async fn criteria_require_editor_or_active_reviewer_and_reorder_atomically() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "task criteria integration requires TEST_DATABASE_URL"
        );
        return;
    };
    let options: PgConnectOptions = database.parse().expect("valid test database URL");
    assert!(
        matches!(
            options.get_host(),
            "localhost" | "127.0.0.1" | "::1" | "[::1]"
        ) && options.get_socket().is_none()
            && options
                .get_database()
                .is_some_and(|name| name.ends_with("_test")),
        "task criteria integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("criteria_{}", Uuid::new_v4().simple());
    let [workspace, task, owner, supervisor, agent] = std::array::from_fn(|_| Uuid::new_v4());
    let mut fixture = pool.begin().await.unwrap();
    sqlx::raw_sql(&format!(
        "CREATE SCHEMA {schema}; SET LOCAL search_path TO {schema}"
    ))
    .execute(&mut *fixture)
    .await
    .unwrap();
    for table in [
        "sessions",
        "workspaces",
        "members",
        "tasks",
        "agent_profiles",
        "runs",
        "task_criteria",
    ] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING ALL)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT name, name, 'criteria-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['owner','supervisor','member','guest','outsider']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Criteria fixture')")
        .bind(workspace)
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO members (id, workspace_id, user_id, name, kind, role) VALUES
         ($1,$4,'owner','Owner','person','member'),
         ($2,$4,'supervisor','Supervisor','person','member'),
         ($3,$4,NULL,'Agent','agent','member'),
         (gen_random_uuid(),$4,'member','Member','person','member'),
         (gen_random_uuid(),$4,'guest','Guest','person','guest')",
    )
    .bind(owner)
    .bind(supervisor)
    .bind(agent)
    .bind(workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tasks (id, workspace_id, number, title, owner_id, worker_id, status)
         VALUES ($1,$2,1,'Criteria task',$3,$4,'needs_review')",
    )
    .bind(task)
    .bind(workspace)
    .bind(owner)
    .bind(agent)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query("INSERT INTO agent_profiles (id, workspace_id, supervisor_id) VALUES ($1,$2,$3)")
        .bind(agent)
        .bind(workspace)
        .bind(supervisor)
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO runs (workspace_id, task_id, agent_id, status)
         VALUES ($1,$2,$3,'needs_review')",
    )
    .bind(workspace)
    .bind(task)
    .bind(agent)
    .execute(&mut *fixture)
    .await
    .unwrap();
    fixture.commit().await.unwrap();
    let mut database_url: url::Url = database.parse().unwrap();
    database_url
        .query_pairs_mut()
        .append_pair("options[search_path]", &schema);

    // Drop the fixture even if an assertion in the spawned task fails.
    let test_schema = schema.clone();
    let test_pool = pool.clone();
    let result = tokio::spawn(async move {
        let app = router().with_state(
            AppState::new(
                Db::connect(database_url.as_str()).await.unwrap(),
                FIXTURE_SECRET.into(),
                &ORIGIN.parse().unwrap(),
            )
            .unwrap(),
        );
        let owner = ("owner", ORIGIN);
        let reviewer = ("supervisor", ORIGIN);
        let list_path = format!("{BASE}?taskId={task}");
        let input = json!({"taskId":task,"text":"Show evidence"});
        request(
            &app,
            Method::POST,
            BASE,
            ("owner", "https://foreign.invalid"),
            input.clone(),
            StatusCode::FORBIDDEN,
        )
        .await;
        assert_eq!(
            request(
                &app,
                Method::GET,
                &list_path,
                owner,
                Value::Null,
                StatusCode::OK
            )
            .await,
            json!([])
        );
        request(
            &app,
            Method::POST,
            BASE,
            reviewer,
            input.clone(),
            StatusCode::FORBIDDEN,
        )
        .await;
        let first = request(&app, Method::POST, BASE, owner, input, StatusCode::CREATED).await;
        let second = request(
            &app,
            Method::POST,
            BASE,
            owner,
            json!({"taskId":task,"text":"Review scope"}),
            StatusCode::CREATED,
        )
        .await;
        assert_eq!(first["position"], 0);
        assert_eq!(second["position"], 1);
        let reorder = format!("{BASE}/reorder");
        for ids in [
            json!([second["id"], second["id"]]),
            json!([second["id"], Uuid::new_v4()]),
            json!([second["id"]]),
        ] {
            request(
                &app,
                Method::POST,
                &reorder,
                owner,
                json!({"taskId":task,"ids":ids}),
                StatusCode::BAD_REQUEST,
            )
            .await;
        }
        assert_eq!(
            request(
                &app,
                Method::GET,
                &list_path,
                reviewer,
                Value::Null,
                StatusCode::OK
            )
            .await,
            json!([first, second]),
        );
        let reordered = request(
            &app,
            Method::POST,
            &reorder,
            owner,
            json!({"taskId":task,"ids":[second["id"],first["id"]]}),
            StatusCode::OK,
        )
        .await;
        assert_eq!(reordered[0]["id"], second["id"]);
        assert_eq!(reordered[1]["id"], first["id"]);
        assert_eq!(reordered[0]["position"], 0);
        assert_eq!(reordered[1]["position"], 1);
        let criterion = format!("{BASE}/{}", first["id"].as_str().unwrap());
        let check = format!("{criterion}/check");
        let uncheck = format!("{criterion}/uncheck");
        for (user, status) in [
            ("member", StatusCode::FORBIDDEN),
            ("guest", StatusCode::FORBIDDEN),
            ("outsider", StatusCode::NOT_FOUND),
            ("agent-bearer", StatusCode::UNAUTHORIZED),
        ] {
            request(
                &app,
                Method::POST,
                &check,
                (user, ORIGIN),
                Value::Null,
                status,
            )
            .await;
        }
        let checked = request(
            &app,
            Method::POST,
            &check,
            reviewer,
            Value::Null,
            StatusCode::OK,
        )
        .await;
        assert_eq!(checked["checkedBy"], json!(supervisor));
        assert!(checked["checkedAt"].is_string());
        assert_eq!(
            request(
                &app,
                Method::POST,
                &check,
                owner,
                Value::Null,
                StatusCode::OK
            )
            .await,
            checked
        );
        request(
            &app,
            Method::PATCH,
            &criterion,
            owner,
            json!({"text":"Edited"}),
            StatusCode::CONFLICT,
        )
        .await;
        let unchecked = request(
            &app,
            Method::POST,
            &uncheck,
            reviewer,
            Value::Null,
            StatusCode::OK,
        )
        .await;
        assert!(unchecked["checkedBy"].is_null());
        assert!(unchecked["checkedAt"].is_null());
        let edited = request(
            &app,
            Method::PATCH,
            &criterion,
            owner,
            json!({"text":"Edited"}),
            StatusCode::OK,
        )
        .await;
        assert_eq!(edited["text"], "Edited");

        sqlx::query(&format!(
            "UPDATE {test_schema}.agent_profiles SET supervisor_id = NULL WHERE id = $1"
        ))
        .bind(agent)
        .execute(&test_pool)
        .await
        .unwrap();
        request(
            &app,
            Method::GET,
            &list_path,
            reviewer,
            Value::Null,
            StatusCode::FORBIDDEN,
        )
        .await;
        request(
            &app,
            Method::POST,
            &check,
            reviewer,
            Value::Null,
            StatusCode::FORBIDDEN,
        )
        .await;
        sqlx::query(&format!(
            "UPDATE {test_schema}.runs SET status = 'completed' WHERE task_id = $1"
        ))
        .bind(task)
        .execute(&test_pool)
        .await
        .unwrap();
        request(
            &app,
            Method::POST,
            &check,
            owner,
            Value::Null,
            StatusCode::CONFLICT,
        )
        .await;
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
