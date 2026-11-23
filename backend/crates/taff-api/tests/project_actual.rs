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

const FIXTURE_SECRET: &str = "taff-project-actual-fixture-secret-not-for-production";
const ORIGIN: &str = "http://localhost:3000";

async fn request(
    app: &Router,
    identity: (&str, &str),
    method: Method,
    project: Uuid,
    input: Value,
    status: StatusCode,
) -> Value {
    let (user, origin) = identity;
    let endpoint = if method == Method::GET {
        "actual"
    } else {
        "budget"
    };
    let mut request = Request::builder()
        .method(method.clone())
        .uri(format!("/api/costs/projects/{project}/{endpoint}"))
        .header(header::ORIGIN, origin)
        .header(header::CONTENT_TYPE, "application/json");
    if user == "agent" {
        request = request.header(header::AUTHORIZATION, "Bearer fixture");
    } else {
        let token = format!("actual-fixture-{user}");
        let mut signer = Hmac::<Sha256>::new_from_slice(FIXTURE_SECRET.as_bytes()).unwrap();
        signer.update(token.as_bytes());
        let signature = STANDARD.encode(signer.finalize().into_bytes());
        request = request.header(
            header::COOKIE,
            format!("better-auth.session_token={token}.{signature}"),
        );
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(input.to_string())).unwrap())
        .await
        .unwrap();
    let actual = response.status();
    if actual == StatusCode::OK {
        assert_eq!(
            response.headers()[header::CACHE_CONTROL],
            "private, no-store"
        );
    }
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    assert_eq!(
        actual, status,
        "{user} {method} {project}/{endpoint}: {body:?}"
    );
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn project_actual_uses_effective_rates_and_budget_writes_require_finance_manage() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "project actual integration requires TEST_DATABASE_URL"
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
        "project actual integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("actual_{}", Uuid::new_v4().simple());
    let [
        workspace,
        other_workspace,
        project,
        empty,
        other_project,
        task,
        standalone,
        other_task,
    ] = std::array::from_fn(|_| Uuid::new_v4());
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
        "projects",
        "tasks",
        "runs",
        "time_entries",
        "member_rates",
        "activity",
        "project_budgets",
    ] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING ALL)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "CREATE TRIGGER project_budgets_audit_change AFTER INSERT OR UPDATE OR DELETE
         ON project_budgets FOR EACH ROW EXECUTE FUNCTION public.taff_audit_change()",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT name, name, 'actual-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['member','admin','guest','outsider']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name) VALUES ($1, 'Actual workspace'), ($2, 'Outside')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO members (workspace_id, user_id, name, kind, role) VALUES
         ($1,'member','Member','person','member'), ($1,'admin','Admin','person','admin'),
         ($1,'guest','Guest','person','guest'), ($1,NULL,'Agent','agent','member'),
         ($2,'outsider','Outsider','person','admin'), ($2,NULL,'Foreign Agent','agent','member')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, workspace_id, name)
         VALUES ($1,$4,'Actual project'), ($2,$4,'Empty project'), ($3,$5,'Foreign project')",
    )
    .bind(project)
    .bind(empty)
    .bind(other_project)
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    for (id, workspace, project, number, owner) in [
        (task, workspace, Some(project), 1, "admin"),
        (standalone, workspace, None, 2, "admin"),
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
             VALUES ($1,$2,$3,'Actual task',$4,
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
    for (workspace, task, status, micros) in [
        (workspace, task, "completed", 70_i64),
        (workspace, task, "failed", 13),
        (workspace, task, "changes_requested", 17),
        (workspace, standalone, "completed", 1000),
        (other_workspace, other_task, "completed", 1000),
    ] {
        sqlx::query(
            "INSERT INTO runs (workspace_id, task_id, status, cost_micros, agent_id)
             VALUES ($1,$2,$3::public.run_status,$4,
                     (SELECT id FROM members WHERE workspace_id = $1 AND kind = 'agent'))",
        )
        .bind(workspace)
        .bind(task)
        .bind(status)
        .bind(micros)
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO member_rates (workspace_id, person_id, rate_micros_per_hour, currency, valid_from)
         SELECT $1, members.id, data.rate, data.currency, data.day
         FROM (VALUES ('member',29,'GBP',DATE '2026-01-01'),
                      ('member',61,'USD',DATE '2026-01-15'),
                      ('member',900,'EUR',DATE '2026-02-01'),
                      ('admin',1,'CNY',DATE '2026-01-01')) AS data(user_id,rate,currency,day)
         JOIN members ON members.user_id = data.user_id AND members.workspace_id = $1",
    )
    .bind(workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO time_entries (workspace_id, task_id, person_id, minutes, day, note)
         SELECT $1, $2, members.id, data.minutes, data.day, 'Private fixture note'
         FROM (VALUES ('member',1,DATE '2026-01-01'), ('member',1,DATE '2026-01-14'),
                      ('member',60,DATE '2026-01-15'), ('admin',30,DATE '2026-01-01'),
                      ('member',12,DATE '2025-12-31'), ('guest',7,DATE '2026-01-01'))
           AS data(user_id,minutes,day)
         JOIN members ON members.user_id = data.user_id AND members.workspace_id = $1",
    )
    .bind(workspace)
    .bind(task)
    .execute(&mut *fixture)
    .await
    .unwrap();
    fixture.commit().await.unwrap();

    let mut scoped: url::Url = database.parse().unwrap();
    scoped
        .query_pairs_mut()
        .append_pair("options[search_path]", &schema);
    let test_pool = pool.clone();
    let test_schema = schema.clone();
    let result = tokio::spawn(async move {
        let app = router().with_state(
            AppState::new(
                Db::connect(scoped.as_str()).await.unwrap(),
                FIXTURE_SECRET.into(),
                &ORIGIN.parse().unwrap(),
            )
            .unwrap(),
        );
        let member = ("member", ORIGIN);
        let admin = ("admin", ORIGIN);
        let actual = request(&app, member, Method::GET, project, Value::Null, StatusCode::OK).await;
        assert_eq!(actual, json!({
            "budget":null,
            "byCurrency":[
                {"currency":"CNY","agentMicros":0,"timeMicros":1,"totalMicros":1},
                {"currency":"GBP","agentMicros":0,"timeMicros":1,"totalMicros":1},
                {"currency":"USD","agentMicros":100,"timeMicros":61,"totalMicros":161}
            ],
            "unratedMinutes":19
        }));
        assert_eq!(
            request(&app, member, Method::GET, empty, Value::Null, StatusCode::OK).await,
            json!({"budget":null,"byCurrency":[],"unratedMinutes":0}),
        );
        for (user, id, status) in [
            ("guest", project, StatusCode::FORBIDDEN),
            ("agent", project, StatusCode::UNAUTHORIZED),
            ("outsider", project, StatusCode::FORBIDDEN),
            ("admin", other_project, StatusCode::FORBIDDEN),
            ("member", Uuid::new_v4(), StatusCode::NOT_FOUND),
        ] {
            request(&app, (user, ORIGIN), Method::GET, id, Value::Null, status).await;
        }

        let initial = json!({"amountMicros":1000,"currency":"USD"});
        let revised = json!({"amountMicros":0,"currency":"GBP"});
        for (identity, id, status) in [
            (member, project, StatusCode::FORBIDDEN),
            (admin, other_project, StatusCode::FORBIDDEN),
            (("admin", "https://foreign.invalid"), project, StatusCode::FORBIDDEN),
            (("agent", ORIGIN), project, StatusCode::UNAUTHORIZED),
        ] {
            request(&app, identity, Method::POST, id, initial.clone(), status).await;
        }
        for invalid in [
            json!({"amountMicros":-1,"currency":"USD"}),
            json!({"amountMicros":9_007_199_254_740_992_i64,"currency":"USD"}),
            json!({"amountMicros":100,"currency":"usd"}),
        ] {
            request(&app, admin, Method::POST, project, invalid, StatusCode::BAD_REQUEST).await;
        }
        assert_eq!(request(&app, admin, Method::POST, project, initial.clone(), StatusCode::OK).await, initial);
        assert_eq!(request(&app, admin, Method::POST, project, revised.clone(), StatusCode::OK).await, revised);
        let mut actual_with_budget = actual;
        actual_with_budget["budget"] = revised;
        assert_eq!(
            request(&app, member, Method::GET, project, Value::Null, StatusCode::OK).await,
            actual_with_budget,
        );
        let audits: Vec<String> = sqlx::query_scalar(&format!(
            "SELECT action FROM {test_schema}.activity
             WHERE workspace_id = $1 AND actor_id = 'admin' AND details = '{{}}'::jsonb ORDER BY action"
        ))
        .bind(workspace)
        .fetch_all(&test_pool)
        .await
        .unwrap();
        assert_eq!(audits, ["project_budgets.insert", "project_budgets.update"]);

        sqlx::query(&format!("UPDATE {test_schema}.members SET role = 'member' WHERE workspace_id = $1 AND user_id = 'admin'"))
            .bind(workspace).execute(&test_pool).await.unwrap();
        request(&app, admin, Method::POST, project, initial, StatusCode::FORBIDDEN).await;
        assert_eq!(
            request(&app, admin, Method::GET, project, Value::Null, StatusCode::OK).await,
            actual_with_budget,
        );
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
