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

const TEST_AUTH_SECRET: &str = "taff-task-links-fixture-not-for-production";

async fn request(
    app: &Router,
    user: &str,
    method: &str,
    uri: &str,
    json_body: Option<Value>,
    expected: StatusCode,
) -> Value {
    let token = format!("task-link-fixture-{user}");
    let mut signature = Hmac::<Sha256>::new_from_slice(TEST_AUTH_SECRET.as_bytes()).unwrap();
    signature.update(token.as_bytes());
    let signature = STANDARD.encode(signature.finalize().into_bytes());
    let mut request = Request::builder().method(method).uri(uri).header(
        header::COOKIE,
        format!("better-auth.session_token={token}.{signature}"),
    );
    let body = match json_body {
        Some(json_body) => {
            request = request.header(header::CONTENT_TYPE, "application/json");
            Body::from(json_body.to_string())
        }
        None => Body::empty(),
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    assert_eq!(status, expected, "{user} {method} {uri}: {body:?}");
    if expected == StatusCode::NO_CONTENT {
        assert!(body.is_empty());
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap()
    }
}

#[tokio::test]
async fn task_links_are_bidirectional_and_require_authority_on_both_active_tasks() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "task links integration requires TEST_DATABASE_URL"
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
        "task links integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("task_links_{}", Uuid::new_v4().simple());
    let [
        workspace,
        other_workspace,
        member,
        other_member,
        first,
        second,
        other_task,
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
    for table in ["sessions", "workspaces", "members", "tasks", "task_links"] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING ALL)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT name, name, 'task-link-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['admin', 'member']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Primary'), ($2, 'Other')")
        .bind(workspace)
        .bind(other_workspace)
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO members (id, workspace_id, user_id, name, kind, role) VALUES
            (DEFAULT, $1, 'admin', 'Admin', 'person', 'admin'),
            (DEFAULT, $2, 'admin', 'Admin', 'person', 'admin'),
            ($3, $1, 'member', 'Member', 'person', 'member'),
            ($4, $1, 'other', 'Other', 'person', 'member')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .bind(member)
    .bind(other_member)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tasks (id, workspace_id, owner_id, title, number) VALUES
            ($1, $4, $6, 'First', 1), ($2, $4, $7, 'Second', 2),
            ($3, $5, (SELECT id FROM members WHERE workspace_id = $5 AND user_id = 'admin'), 'Foreign', 1)",
    )
    .bind(first).bind(second).bind(other_task).bind(workspace).bind(other_workspace)
    .bind(member).bind(other_member).execute(&mut *fixture).await.unwrap();
    let mut scoped_database: url::Url = database.parse().unwrap();
    scoped_database
        .query_pairs_mut()
        .append_pair("options[search_path]", &format!("{schema},public"));
    fixture.commit().await.unwrap();

    let result = tokio::spawn(async move {
        let scoped_pool = PgPool::connect(scoped_database.as_str()).await.unwrap();
        let state = AppState::new(
            Db::connect(scoped_database.as_str()).await.unwrap(),
            TEST_AUTH_SECRET.into(),
            &"http://localhost:3000".parse().unwrap(),
        )
        .unwrap();
        let app = router().with_state(state);
        let route = "/api/task-links";
        let links_for = |task| format!("{route}?taskId={task}");
        let input = |from, to, kind| json!({"fromTaskId": from, "toTaskId": to, "kind": kind});
        assert_eq!(
            request(
                &app,
                "member",
                "POST",
                route,
                Some(input(first, second, "related")),
                StatusCode::FORBIDDEN
            )
            .await,
            json!({"error": "forbidden"})
        );
        for (from, to) in [(first, first), (first, other_task)] {
            assert_eq!(
                request(
                    &app,
                    "admin",
                    "POST",
                    route,
                    Some(input(from, to, "related")),
                    StatusCode::BAD_REQUEST
                )
                .await,
                json!({"error": "invalid_input"})
            );
        }
        let created = request(
            &app,
            "admin",
            "POST",
            route,
            Some(input(first, second, "related")),
            StatusCode::CREATED,
        )
        .await;
        assert_eq!(created["fromTaskId"], json!(first.min(second)));
        assert_eq!(created["toTaskId"], json!(first.max(second)));
        assert_eq!(created["otherTaskId"], json!(second));
        assert_eq!(created["otherTaskTitle"], json!("Second"));
        assert_eq!(
            request(
                &app,
                "admin",
                "POST",
                route,
                Some(input(second, first, "related")),
                StatusCode::CONFLICT
            )
            .await,
            json!({"error": "conflict"})
        );
        let duplicate = request(
            &app,
            "admin",
            "POST",
            route,
            Some(input(second, first, "duplicate")),
            StatusCode::CREATED,
        )
        .await;
        assert_eq!(duplicate["kind"], json!("duplicate"));
        let related_url = format!("{route}/{}", created["id"].as_str().unwrap());
        assert_eq!(
            request(
                &app,
                "member",
                "DELETE",
                &related_url,
                None,
                StatusCode::FORBIDDEN
            )
            .await,
            json!({"error": "forbidden"})
        );
        assert_eq!(
            request(
                &app,
                "member",
                "GET",
                &links_for(first),
                None,
                StatusCode::OK
            )
            .await,
            json!([])
        );
        for (task, other, title) in [(first, second, "Second"), (second, first, "First")] {
            let rows = request(&app, "admin", "GET", &links_for(task), None, StatusCode::OK).await;
            let rows = rows.as_array().unwrap();
            assert_eq!(rows.len(), 2);
            assert!(rows.iter().any(|link| link["id"] == created["id"]));
            assert!(rows.iter().any(|link| link["id"] == duplicate["id"]));
            for row in rows {
                assert_eq!(row["otherTaskId"], json!(other));
                assert_eq!(row["otherTaskTitle"], json!(title));
            }
        }
        request(
            &app,
            "admin",
            "DELETE",
            &related_url,
            None,
            StatusCode::NO_CONTENT,
        )
        .await;
        assert_eq!(
            request(
                &app,
                "admin",
                "GET",
                &links_for(second),
                None,
                StatusCode::OK
            )
            .await,
            json!([duplicate])
        );
        sqlx::query("UPDATE tasks SET archived_at = now() WHERE id = $1")
            .bind(second)
            .execute(&scoped_pool)
            .await
            .unwrap();
        assert_eq!(
            request(
                &app,
                "admin",
                "GET",
                &links_for(first),
                None,
                StatusCode::OK
            )
            .await,
            json!([])
        );
        let duplicate_url = format!("{route}/{}", duplicate["id"].as_str().unwrap());
        assert_eq!(
            request(
                &app,
                "admin",
                "DELETE",
                &duplicate_url,
                None,
                StatusCode::FORBIDDEN
            )
            .await,
            json!({"error": "forbidden"})
        );
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
