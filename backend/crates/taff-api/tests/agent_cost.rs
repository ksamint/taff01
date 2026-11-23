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

const TEST_AUTH_SECRET: &str = "taff-agent-cost-fixture-secret-not-for-production";

async fn cost(
    app: &Router,
    user: &str,
    target: &str,
    id: Uuid,
    expected_status: StatusCode,
) -> Value {
    let token = format!("cost-fixture-{user}");
    let mut signature = Hmac::<Sha256>::new_from_slice(TEST_AUTH_SECRET.as_bytes()).unwrap();
    signature.update(token.as_bytes());
    let signature = STANDARD.encode(signature.finalize().into_bytes());
    let request = Request::builder()
        .uri(format!("/api/costs/{target}/{id}"))
        .header(
            header::COOKIE,
            format!("better-auth.session_token={token}.{signature}"),
        )
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let result: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        status, expected_status,
        "{user} reading {target}/{id}: {result}"
    );
    result
}

#[tokio::test]
async fn costs_include_failed_and_rework_runs_and_respect_workspace_finance_access() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "agent cost integration requires TEST_DATABASE_URL"
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
        "agent cost integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("agent_cost_{}", Uuid::new_v4().simple());
    let [
        workspace,
        other_workspace,
        project,
        other_project,
        task,
        second_task,
        standalone,
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
    for table in [
        "sessions",
        "workspaces",
        "members",
        "projects",
        "tasks",
        "runs",
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
         SELECT name, name, 'cost-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['admin', 'member', 'guest', 'outsider']) AS users(name)",
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
        "INSERT INTO members (workspace_id, user_id, name, kind, role) VALUES
           ($1, 'admin', 'Admin', 'person', 'admin'),
           ($1, 'member', 'Member', 'person', 'member'),
           ($1, 'guest', 'Guest', 'person', 'guest'),
           ($1, NULL, 'Agent', 'agent', 'member'),
           ($2, 'outsider', 'Outsider', 'person', 'member'),
           ($2, NULL, 'Agent', 'agent', 'member')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, workspace_id, name) VALUES
           ($1, $2, 'Primary project'), ($3, $4, 'Other project')",
    )
    .bind(project)
    .bind(workspace)
    .bind(other_project)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    for (id, workspace, project, number, owner) in [
        (task, workspace, Some(project), 1, "admin"),
        (second_task, workspace, Some(project), 2, "admin"),
        (standalone, workspace, None, 3, "admin"),
        (
            other_task,
            other_workspace,
            Some(other_project),
            1,
            "outsider",
        ),
    ] {
        sqlx::query(
            "INSERT INTO tasks (id, workspace_id, project_id, title, number, owner_id)
             VALUES ($1, $2, $3, 'Cost fixture task', $4,
                     (SELECT id FROM members WHERE workspace_id = $2 AND user_id = $5))",
        )
        .bind(id)
        .bind(workspace)
        .bind(project)
        .bind(number)
        .bind(owner)
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    for (workspace, task, status, micros, millis) in [
        (workspace, task, "completed", 120_i64, 100_i64),
        (workspace, task, "failed", 30, 200),
        (workspace, task, "changes_requested", 50, 200),
        (workspace, second_task, "completed", 80, 300),
        (workspace, standalone, "completed", 90, 400),
        (other_workspace, other_task, "completed", 700, 900),
    ] {
        sqlx::query(
            "INSERT INTO runs (workspace_id, task_id, status, cost_micros, duration_ms, agent_id)
             VALUES ($1, $2, $3::public.run_status, $4, $5,
                     (SELECT id FROM members WHERE workspace_id = $1 AND kind = 'agent'))",
        )
        .bind(workspace)
        .bind(task)
        .bind(status)
        .bind(micros)
        .bind(millis)
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    let mut scoped_database: url::Url = database.parse().unwrap();
    scoped_database
        .query_pairs_mut()
        .append_pair("options[search_path]", &schema);
    fixture.commit().await.unwrap();

    // Run assertions in a task so fixture cleanup also runs when an assertion panics.
    let result = tokio::spawn(async move {
        let db = Db::connect(scoped_database.as_str()).await.unwrap();
        let state = AppState::new(
            db,
            TEST_AUTH_SECRET.into(),
            &"http://localhost:3000".parse().unwrap(),
        )
        .unwrap();
        let app = router().with_state(state);
        for user in ["admin", "member"] {
            assert_eq!(
                cost(&app, user, "tasks", task, StatusCode::OK).await,
                json!({"costMicros": 200, "runs": 3, "failedRuns": 1,
                       "failedCostMicros": 30, "durationMs": 500})
            );
            assert_eq!(
                cost(&app, user, "projects", project, StatusCode::OK).await,
                json!({"costMicros": 280, "runs": 4, "failedRuns": 1,
                       "failedCostMicros": 30, "durationMs": 800})
            );
        }
        assert_eq!(
            cost(&app, "admin", "tasks", standalone, StatusCode::OK).await,
            json!({"costMicros": 90, "runs": 1, "failedRuns": 0,
                   "failedCostMicros": 0, "durationMs": 400})
        );
        assert_eq!(
            cost(&app, "outsider", "projects", other_project, StatusCode::OK).await,
            json!({"costMicros": 700, "runs": 1, "failedRuns": 0,
                   "failedCostMicros": 0, "durationMs": 900})
        );
        for (user, resource, id) in [
            ("guest", "tasks", task),
            ("guest", "projects", project),
            ("outsider", "tasks", task),
            ("outsider", "projects", project),
            ("member", "tasks", standalone),
            ("member", "tasks", other_task),
            ("member", "projects", other_project),
        ] {
            assert_eq!(
                cost(&app, user, resource, id, StatusCode::FORBIDDEN).await,
                json!({"error": "forbidden"})
            );
        }
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
