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
use taff_contract::TimeEntries;
use taff_db::Db;
use tower::ServiceExt;
use uuid::Uuid;

const FIXTURE_SECRET: &str = "taff-time-tracking-fixture-secret-not-for-production";
const ORIGIN: &str = "http://localhost:3000";
const ENTRIES: &str = "/api/time-entries";
const RATES: &str = "/api/member-rates";

async fn request(
    app: &Router,
    identity: (&str, &str),
    method: Method,
    path: &str,
    input: Value,
    status: StatusCode,
) -> Value {
    let (user, origin) = identity;
    let mut request = Request::builder()
        .method(method.clone())
        .uri(path)
        .header(header::ORIGIN, origin)
        .header(header::CONTENT_TYPE, "application/json");
    if user == "agent" {
        request = request.header(header::AUTHORIZATION, "Bearer fixture");
    } else {
        let token = format!("time-fixture-{user}");
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
    let body = to_bytes(response.into_body(), 8192).await.unwrap();
    assert_eq!(actual, status, "{user} {method} {path}: {body:?}");
    if actual == StatusCode::NO_CONTENT {
        assert!(body.is_empty());
        return Value::Null;
    }
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn time_and_rates_respect_person_ownership_admin_access_and_civil_dates() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "time tracking integration requires TEST_DATABASE_URL"
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
        "time tracking integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("time_{}", Uuid::new_v4().simple());
    let [
        workspace,
        other_workspace,
        member,
        admin,
        agent,
        task,
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
        "tasks",
        "time_entries",
        "member_rates",
        "activity",
    ] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING ALL)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    for table in ["time_entries", "member_rates"] {
        sqlx::query(&format!(
            "CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON {table}
             FOR EACH ROW EXECUTE FUNCTION public.taff_audit_time_tracking_change()"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT name, name, 'time-fixture-' || name, now() + interval '1 hour'
         FROM unnest(ARRAY['member','admin','outsider']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name, time_zone)
         VALUES ($1, 'Time workspace', 'Asia/Singapore'), ($2, 'Outside', 'UTC')",
    )
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO members (id, workspace_id, user_id, name, kind, role) VALUES
         ($1,$4,'member','Member','person','member'), ($2,$4,'admin','Admin','person','admin'),
         ($3,$4,NULL,'Agent','agent','member'), (gen_random_uuid(),$5,'outsider','Outsider','person','admin')",
    )
    .bind(member)
    .bind(admin)
    .bind(agent)
    .bind(workspace)
    .bind(other_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tasks (id, workspace_id, number, title, owner_id)
         VALUES ($1,$2,1,'Time task',$3),
                ($4,$5,1,'Other task',(SELECT id FROM members WHERE workspace_id = $5 AND user_id = 'outsider'))",
    )
    .bind(task)
    .bind(workspace)
    .bind(member)
    .bind(other_task)
    .bind(other_workspace)
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
    // Clean up the isolated fixture even when a case fails.
    let result = tokio::spawn(async move {
        let app = router().with_state(
            AppState::new(
                Db::connect(scoped.as_str()).await.unwrap(),
                FIXTURE_SECRET.into(),
                &ORIGIN.parse().unwrap(),
            )
            .unwrap(),
        );
        let member_cookie = ("member", ORIGIN);
        let admin_cookie = ("admin", ORIGIN);
        let entry_list = format!("{ENTRIES}?workspaceId={workspace}");
        let rate_list = format!("{RATES}?workspaceId={workspace}");
        let time = json!({"taskId":task,"minutes":60,"day":"2026-11-23","note":"Private note"});
        request(&app, ("member", "https://foreign.invalid"), Method::POST, ENTRIES, time.clone(), StatusCode::FORBIDDEN).await;
        request(&app, ("agent", ORIGIN), Method::POST, ENTRIES, time.clone(), StatusCode::UNAUTHORIZED).await;
        request(&app, ("outsider", ORIGIN), Method::POST, ENTRIES, time.clone(), StatusCode::NOT_FOUND).await;
        request(&app, member_cookie, Method::POST, ENTRIES, json!({"taskId":task,"minutes":60,"day":"2026-02-29","note":""}), StatusCode::BAD_REQUEST).await;
        let entry = request(&app, member_cookie, Method::POST, ENTRIES, time.clone(), StatusCode::CREATED).await;
        assert_eq!(entry["personId"], json!(member));
        assert_eq!(entry["day"], "2026-11-23");
        let admin_entry = request(&app, admin_cookie, Method::POST, ENTRIES, time, StatusCode::CREATED).await;
        assert_eq!(admin_entry["personId"], json!(admin));

        let task_list = format!("{entry_list}&taskId={task}");
        let own = request(&app, member_cookie, Method::GET, &task_list, Value::Null, StatusCode::OK).await;
        assert_eq!(own["timeZone"], "Asia/Singapore");
        serde_json::from_value::<TimeEntries>(own.clone()).unwrap();
        assert_eq!(own["entries"], json!([entry]));
        let other_tasks = format!("{entry_list}&taskId={other_task}");
        let result = request(&app, member_cookie, Method::GET, &other_tasks, Value::Null, StatusCode::OK).await;
        assert_eq!(result["entries"], json!([]));
        for path in [format!("{entry_list}&all=true"), format!("{entry_list}&personId={admin}")] {
            request(&app, member_cookie, Method::GET, &path, Value::Null, StatusCode::FORBIDDEN).await;
        }
        let admin_default = request(&app, admin_cookie, Method::GET, &entry_list, Value::Null, StatusCode::OK).await;
        assert_eq!(admin_default["entries"], json!([admin_entry]));
        let admin_all = request(&app, admin_cookie, Method::GET, &format!("{entry_list}&all=true"), Value::Null, StatusCode::OK).await;
        assert_eq!(admin_all["entries"].as_array().unwrap().len(), 2);
        request(&app, admin_cookie, Method::GET, &format!("{entry_list}&all=true&personId={admin}"), Value::Null, StatusCode::BAD_REQUEST).await;

        let entry_path = format!("{ENTRIES}/{}", entry["id"].as_str().unwrap());
        let edit = json!({"minutes":1440,"day":"2026-11-24","note":""});
        request(&app, admin_cookie, Method::PATCH, &entry_path, edit.clone(), StatusCode::FORBIDDEN).await;
        request(&app, admin_cookie, Method::DELETE, &entry_path, Value::Null, StatusCode::FORBIDDEN).await;
        let edited = request(&app, member_cookie, Method::PATCH, &entry_path, edit, StatusCode::OK).await;
        assert_eq!(edited["minutes"], 1440);
        assert_eq!(edited["day"], "2026-11-24");
        assert_eq!(edited["createdAt"], entry["createdAt"]);
        request(&app, member_cookie, Method::DELETE, &entry_path, Value::Null, StatusCode::NO_CONTENT).await;
        request(&app, member_cookie, Method::DELETE, &entry_path, Value::Null, StatusCode::NOT_FOUND).await;

        let rate = |person, amount, currency, date| {
            json!({"workspaceId":workspace,"personId":person,"rateMicrosPerHour":amount,"currency":currency,"validFrom":date})
        };
        let day = "2026-11-23";
        let first_rate = rate(member, 5_000_000, "USD", day);
        request(&app, member_cookie, Method::POST, RATES, first_rate.clone(), StatusCode::FORBIDDEN).await;
        request(&app, admin_cookie, Method::POST, RATES, rate(agent, 5_000_000, "USD", day), StatusCode::NOT_FOUND).await;
        request(&app, admin_cookie, Method::POST, RATES, rate(member, 9_007_199_254_740_992_i64, "USD", day), StatusCode::BAD_REQUEST).await;
        request(&app, admin_cookie, Method::POST, RATES, rate(member, 5_000_000, "usd", day), StatusCode::BAD_REQUEST).await;
        assert_eq!(request(&app, admin_cookie, Method::POST, RATES, first_rate.clone(), StatusCode::OK).await, first_rate);
        let revised = rate(member, 9_007_199_254_740_991_i64, "CNY", day);
        assert_eq!(request(&app, admin_cookie, Method::POST, RATES, revised.clone(), StatusCode::OK).await, revised);
        let future = rate(member, 0, "CNY", "2026-12-01");
        request(&app, admin_cookie, Method::POST, RATES, future.clone(), StatusCode::OK).await;
        let admin_rate = rate(admin, 6_000_000, "CNY", day);
        request(&app, admin_cookie, Method::POST, RATES, admin_rate.clone(), StatusCode::OK).await;
        assert_eq!(request(&app, member_cookie, Method::GET, &rate_list, Value::Null, StatusCode::OK).await, json!([future, revised]));
        assert_eq!(request(&app, admin_cookie, Method::GET, &rate_list, Value::Null, StatusCode::OK).await, json!([admin_rate]));
        let all_rates = format!("{rate_list}&all=true");
        assert_eq!(request(&app, admin_cookie, Method::GET, &all_rates, Value::Null, StatusCode::OK).await.as_array().unwrap().len(), 3);
        request(&app, member_cookie, Method::GET, &all_rates, Value::Null, StatusCode::FORBIDDEN).await;
        request(&app, member_cookie, Method::GET, &format!("{rate_list}&personId={admin}"), Value::Null, StatusCode::FORBIDDEN).await;

        sqlx::query(&format!("UPDATE {test_schema}.members SET role = 'member' WHERE id = $1"))
            .bind(admin).execute(&test_pool).await.unwrap();
        request(&app, admin_cookie, Method::GET, &all_rates, Value::Null, StatusCode::FORBIDDEN).await;
        request(&app, admin_cookie, Method::GET, &format!("{entry_list}&all=true"), Value::Null, StatusCode::FORBIDDEN).await;
        request(&app, admin_cookie, Method::POST, RATES, first_rate, StatusCode::FORBIDDEN).await;

        let audits: i64 = sqlx::query_scalar(&format!(
            "SELECT count(*) FROM {test_schema}.activity
             WHERE details = '{{}}'::jsonb AND
                   (actor_id = 'member' AND action = 'time_entries.delete'
                    OR actor_id = 'admin' AND action = 'member_rates.update')"
        ))
        .fetch_one(&test_pool)
        .await
        .unwrap();
        assert_eq!(audits, 2);
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
