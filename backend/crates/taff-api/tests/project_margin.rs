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

const FIXTURE_SECRET: &str = "taff-project-margin-fixture-secret-not-for-production";

async fn read_margin(app: &Router, user: &str, project: Uuid, status: StatusCode) -> Value {
    let mut request = Request::builder().uri(format!("/api/costs/projects/{project}/margin"));
    if user == "agent" {
        request = request.header(header::AUTHORIZATION, "Bearer fixture");
    } else {
        let token = format!("margin-fixture-{user}");
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
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let actual = response.status();
    assert_eq!(
        response.headers()[header::CACHE_CONTROL],
        "private, no-store"
    );
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    assert_eq!(actual, status, "{user} GET {project}/margin: {body:?}");
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn margin_combines_exact_payments_and_actuals_only_in_one_currency() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "project margin integration requires TEST_DATABASE_URL"
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
        "project margin integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("margin_{}", Uuid::new_v4().simple());
    let [
        workspace,
        other_workspace,
        paid,
        empty,
        cost_only,
        mismatch,
        unrated,
        legacy,
        foreign,
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
        "project_payments",
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
         SELECT name, name, 'margin-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['member','admin','guest','outsider']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name) VALUES ($1, 'Margin workspace'), ($2, 'Outside')",
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
         ($2,'outsider','Outsider','person','admin')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    for (id, workspace, name, currency) in [
        (paid, workspace, "Paid", Some("USD")),
        (empty, workspace, "Empty", None),
        (cost_only, workspace, "Cost only", None),
        (mismatch, workspace, "Wrong currency", Some("CNY")),
        (unrated, workspace, "Unrated labor", Some("CNY")),
        (legacy, workspace, "No legacy currency", None),
        (foreign, other_workspace, "Foreign", Some("USD")),
    ] {
        sqlx::query("INSERT INTO projects (id, workspace_id, name, currency) VALUES ($1,$2,$3,$4)")
            .bind(id)
            .bind(workspace)
            .bind(name)
            .bind(currency)
            .execute(&mut *fixture)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO tasks (id, workspace_id, project_id, title, number, owner_id)
         SELECT projects.id, projects.workspace_id, projects.id, 'Margin task',
                row_number() OVER (PARTITION BY projects.workspace_id)::integer, members.id
         FROM projects JOIN members ON members.workspace_id = projects.workspace_id
         WHERE members.role = 'admin'",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO runs (workspace_id, task_id, status, cost_micros, agent_id)
         SELECT $1, data.task, 'failed', data.cost, members.id
         FROM unnest($2::uuid[], $3::bigint[]) AS data(task,cost)
         JOIN members ON members.workspace_id = $1 AND members.kind = 'agent'",
    )
    .bind(workspace)
    .bind([paid, cost_only, mismatch, unrated])
    .bind([1_000_000_i64, 15, 20, 25])
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO member_rates (workspace_id, person_id, rate_micros_per_hour, currency, valid_from)
         SELECT $1, members.id, data.rate, data.currency, DATE '2026-01-01'
         FROM (VALUES ('member',120,'USD'), ('admin',0,'EUR')) AS data(user_id,rate,currency)
         JOIN members ON members.user_id = data.user_id AND members.workspace_id = $1",
    )
    .bind(workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO time_entries (workspace_id, task_id, person_id, minutes, day, note)
         SELECT $1, data.task, members.id, data.minutes, DATE '2026-01-01', 'Private time note'
         FROM (VALUES ($2::uuid,'member',30), ($2,'admin',30), ($3,'admin',30), ($4,'guest',60))
           AS data(task,user_id,minutes)
         JOIN members ON members.user_id = data.user_id AND members.workspace_id = $1",
    )
    .bind(workspace)
    .bind(paid)
    .bind(empty)
    .bind(unrated)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_payments (workspace_id, project_id, amount, paid_on, created_by)
         SELECT $1, data.project, data.amount, DATE '2026-01-01', members.id
         FROM (VALUES ($2::uuid,12.34), ($2,0.01), ($3,45.67)) AS data(project,amount)
         JOIN members ON members.workspace_id = $1 AND members.user_id = 'admin'",
    )
    .bind(workspace)
    .bind(paid)
    .bind(legacy)
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
                &"http://localhost:3000".parse().unwrap(),
            )
            .unwrap(),
        );
        assert_eq!(
            read_margin(&app, "member", paid, StatusCode::OK).await,
            json!({"currency":"USD","paidMicros":12_350_000,"actualMicros":1_000_060,"marginMicros":11_349_940}),
        );
        assert_eq!(
            read_margin(&app, "admin", cost_only, StatusCode::OK).await,
            json!({"currency":"USD","paidMicros":0,"actualMicros":15,"marginMicros":-15}),
        );
        assert_eq!(
            read_margin(&app, "member", empty, StatusCode::OK).await,
            json!({"currency":null,"paidMicros":0,"actualMicros":0,"marginMicros":0}),
        );
        for (project, code) in [(mismatch,"currency_mismatch"), (unrated,"cost_incomplete"), (legacy,"currency_mismatch")] {
            assert_eq!(
                read_margin(&app, "member", project, StatusCode::CONFLICT).await,
                json!({"error":code}),
            );
        }
        for (user, project, status) in [
            ("guest", paid, StatusCode::FORBIDDEN),
            ("agent", paid, StatusCode::UNAUTHORIZED),
            ("outsider", paid, StatusCode::FORBIDDEN),
            ("admin", foreign, StatusCode::FORBIDDEN),
            ("member", Uuid::new_v4(), StatusCode::NOT_FOUND),
        ] {
            read_margin(&app, user, project, status).await;
        }
        sqlx::query(&format!("UPDATE {test_schema}.member_rates SET rate_micros_per_hour = 100 WHERE currency = 'EUR'"))
            .execute(&test_pool).await.unwrap();
        assert_eq!(
            read_margin(&app, "member", paid, StatusCode::CONFLICT).await,
            json!({"error":"currency_mismatch"}),
        );
        sqlx::query(&format!("UPDATE {test_schema}.members SET role = 'guest' WHERE workspace_id = $1 AND user_id = 'member'"))
            .bind(workspace).execute(&test_pool).await.unwrap();
        read_margin(&app, "member", paid, StatusCode::FORBIDDEN).await;
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
