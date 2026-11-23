use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
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

const TEST_AUTH_SECRET: &str = "taff-project-health-fixture-not-for-production";

async fn request(
    app: &Router,
    uri: &str,
    auth: Option<(&str, &str)>,
    input: Option<Value>,
    expected_status: StatusCode,
) -> Value {
    let mut request = Request::builder().uri(uri);
    if let Some((name, value)) = auth {
        request = request.header(name, value);
    }
    let body = match input {
        Some(input) => {
            request = request
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json");
            Body::from(input.to_string())
        }
        None => Body::empty(),
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 32 * 1024).await.unwrap();
    let output: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(status, expected_status, "{uri}: {output}");
    output
}

fn cookie(user: &str) -> String {
    let token = format!("project-health-fixture-{user}");
    let mut signature = Hmac::<Sha256>::new_from_slice(TEST_AUTH_SECRET.as_bytes()).unwrap();
    signature.update(token.as_bytes());
    let signature = STANDARD.encode(signature.finalize().into_bytes());
    format!("better-auth.session_token={token}.{signature}")
}

#[tokio::test]
async fn project_health_access_and_history() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "project health integration requires TEST_DATABASE_URL"
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
        "project health integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("project_health_{}", Uuid::new_v4().simple());
    let [
        workspace,
        foreign,
        project,
        sibling,
        foreign_project,
        lead_id,
        admin_id,
    ] = std::array::from_fn(|_| Uuid::new_v4());
    let mut fixture = pool.begin().await.unwrap();
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(&format!("SET LOCAL search_path TO {schema}"))
        .execute(&mut *fixture)
        .await
        .unwrap();
    for table in [
        "sessions",
        "workspaces",
        "members",
        "projects",
        "project_updates",
        "activity",
    ] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING DEFAULTS)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT name, name, 'project-health-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['admin', 'lead', 'member', 'guest']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Primary'), ($2, 'Other')")
        .bind(workspace)
        .bind(foreign)
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO members (id, workspace_id, user_id, name, kind, role) VALUES
            ($2, $1, 'admin', 'Admin', 'person', 'admin'),
            ($3, $1, 'lead', 'Lead', 'person', 'member'),
            (DEFAULT, $1, 'member', 'Member', 'person', 'member'),
            (DEFAULT, $1, 'guest', 'Guest', 'person', 'guest')",
    )
    .bind(workspace)
    .bind(admin_id)
    .bind(lead_id)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, workspace_id, name, lead_id) VALUES
            ($1, $2, 'Project', $3), ($4, $2, 'Sibling', NULL), ($5, $6, 'Other', NULL)",
    )
    .bind(project)
    .bind(workspace)
    .bind(lead_id)
    .bind(sibling)
    .bind(foreign_project)
    .bind(foreign)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_updates (workspace_id, project_id, author_id, health, body, created_at)
         SELECT $1, $2, $3, 'on_track'::public.project_health, 'seed-' || n, '2000-01-01 UTC'::timestamptz
               + n * interval '1 second'
         FROM generate_series(1, 18) AS history(n)",
    )
    .bind(workspace).bind(project).bind(admin_id).execute(&mut *fixture).await.unwrap();
    sqlx::query(
        "CREATE TRIGGER project_updates_audit AFTER INSERT ON project_updates
         FOR EACH ROW EXECUTE FUNCTION public.taff_audit_change()",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    let mut scoped_database: url::Url = database.parse().unwrap();
    scoped_database
        .query_pairs_mut()
        .append_pair("options[search_path]", &format!("{schema},public"));
    fixture.commit().await.unwrap();

    // Preserve cleanup even when an assertion panics.
    let result =
        tokio::spawn(async move {
            let scoped_pool = PgPool::connect(scoped_database.as_str()).await.unwrap();
            let state = AppState::new(
                Db::connect(scoped_database.as_str()).await.unwrap(),
                TEST_AUTH_SECRET.into(),
                &"http://localhost:3000".parse().unwrap(),
            )
            .unwrap();
            let app = router().with_state(state);
            let path = "/api/project-updates";
            let list = format!("{path}?projectId={project}");
            let input =
                |body: &str| json!({"projectId": project, "health": "at_risk", "body": body});
            let admin = cookie("admin");
            let lead = cookie("lead");
            let guest = cookie("guest");
            let foreign_origin = app
                .clone()
                .oneshot(
                    Request::post(path)
                        .header(header::COOKIE, &admin)
                        .header(header::ORIGIN, "https://foreign.example")
                        .header(header::CONTENT_TYPE, "application/json")
                        .body(Body::from(input("denied").to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(foreign_origin.status(), StatusCode::FORBIDDEN);
            for auth in [
                None,
                Some((header::AUTHORIZATION.as_str(), "Bearer fixture-agent")),
            ] {
                for (uri, body) in [(&*list, None), (path, Some(input("denied")))] {
                    assert_eq!(
                        request(&app, uri, auth, body, StatusCode::UNAUTHORIZED).await,
                        json!({"error": "unauthorized"})
                    );
                }
            }
            for denied in [cookie("member"), guest.clone()] {
                assert_eq!(
                    request(
                        &app,
                        path,
                        Some(("cookie", &denied)),
                        Some(input("denied")),
                        StatusCode::FORBIDDEN
                    )
                    .await,
                    json!({"error": "forbidden"})
                );
            }
            assert_eq!(
                request(
                    &app,
                    path,
                    Some(("cookie", &admin)),
                    Some(input(&"餐".repeat(2001))),
                    StatusCode::BAD_REQUEST
                )
                .await,
                json!({"error": "invalid_input"})
            );
            let mut posted = Vec::new();
            for (session, author, body) in [
                (&lead, lead_id, "lead update"),
                (&admin, admin_id, "admin update"),
                (&lead, lead_id, "lead after downgrade"),
            ] {
                if body == "lead after downgrade" {
                    sqlx::query("UPDATE members SET role = 'guest' WHERE id = $1")
                        .bind(lead_id)
                        .execute(&scoped_pool)
                        .await
                        .unwrap();
                }
                let update = request(
                    &app,
                    path,
                    Some(("cookie", session)),
                    Some(input(body)),
                    StatusCode::CREATED,
                )
                .await;
                assert_eq!(update["authorId"], json!(author));
                assert_eq!(update["projectId"], json!(project));
                assert_eq!(update["health"], json!("at_risk"));
                assert_eq!(update["body"], json!(body));
                posted.push(update);
            }
            let page = request(&app, &list, Some(("cookie", &guest)), None, StatusCode::OK).await;
            let updates = page["updates"].as_array().unwrap();
            assert_eq!(updates.len(), 20);
            posted.reverse();
            assert_eq!(&updates[..3], posted.as_slice());
            for (position, update) in updates[3..].iter().enumerate() {
                assert_eq!(update["body"], json!(format!("seed-{}", 18 - position)));
            }
            let cursor = page["nextCursor"].as_str().unwrap();
            assert_eq!(page["nextCursor"], updates[19]["id"]);
            let last = request(
                &app,
                &format!("{list}&before={cursor}"),
                Some(("cookie", &guest)),
                None,
                StatusCode::OK,
            )
            .await;
            assert_eq!(last["updates"].as_array().unwrap().len(), 1);
            assert_eq!(last["updates"][0]["body"], json!("seed-1"));
            assert!(last["nextCursor"].is_null());
            let other = request(
                &app,
                &format!("{path}?projectId={sibling}"),
                Some(("cookie", &guest)),
                None,
                StatusCode::OK,
            )
            .await;
            assert_eq!(other["updates"], json!([]));
            assert_eq!(
                request(
                    &app,
                    &format!("{path}?projectId={foreign_project}"),
                    Some(("cookie", &admin)),
                    None,
                    StatusCode::FORBIDDEN
                )
                .await,
                json!({"error": "forbidden"})
            );
            assert_eq!(
            request(&app, path, Some(("cookie", &admin)),
                Some(json!({"projectId": foreign_project, "health": "on_track", "body": "denied"})),
                StatusCode::FORBIDDEN).await,
            json!({"error": "forbidden"})
        );
            let audit = sqlx::query_as::<_, (String, String)>(
            "SELECT resource_id, actor_id FROM activity WHERE action = 'project_updates.insert'",
        )
        .fetch_all(&scoped_pool).await.unwrap();
            assert_eq!(audit.len(), 3);
            for (update, actor) in posted.iter().zip(["lead", "admin", "lead"]) {
                assert!(audit.contains(&(update["id"].as_str().unwrap().into(), actor.into())));
            }
        })
        .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
