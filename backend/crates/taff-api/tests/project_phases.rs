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

const FIXTURE_SECRET: &str = "taff-project-phases-fixture-secret-not-for-production";
const ORIGIN: &str = "http://localhost:3000";
const BASE: &str = "/api/project-phases";

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
        let token = format!("phases-fixture-{user}");
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
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn phases_append_concurrently_and_stay_scoped_to_project_managers() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "project phases integration requires TEST_DATABASE_URL"
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
        "project phases integration requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("phases_{}", Uuid::new_v4().simple());
    let [workspace, outside, project, foreign] = std::array::from_fn(|_| Uuid::new_v4());
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
        "project_phases",
        "activity",
    ] {
        sqlx::query(&format!(
            "CREATE TABLE {table} (LIKE public.{table} INCLUDING ALL)"
        ))
        .execute(&mut *fixture)
        .await
        .unwrap();
    }
    sqlx::query(
        "CREATE TRIGGER project_phases_audit_change AFTER INSERT OR UPDATE OR DELETE
         ON project_phases FOR EACH ROW EXECUTE FUNCTION public.taff_audit_change()",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sessions (id,user_id,token,expires_at)
         SELECT name,name,'phases-fixture-' || name,now() + interval '1 hour'
         FROM unnest(ARRAY['admin','lead','guest','outsider']) AS users(name)",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id,name) VALUES ($1,'Phases workspace'),($2,'Outside')")
        .bind(workspace)
        .bind(outside)
        .execute(&mut *fixture)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO members (workspace_id,user_id,name,kind,role)
         VALUES ($1,'admin','Admin','person','admin'),($1,'lead','Lead','person','member'),
                ($1,'guest','Guest','person','guest'),($2,'outsider','Outsider','person','admin')",
    )
    .bind(workspace)
    .bind(outside)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id,workspace_id,name,lead_id)
         VALUES ($1,$3,'Phases',(SELECT id FROM members WHERE workspace_id=$3 AND user_id='lead')),
                ($2,$4,'Foreign',NULL)",
    )
    .bind(project)
    .bind(foreign)
    .bind(workspace)
    .bind(outside)
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
        let app = router().with_state(AppState::new(
            Db::connect(scoped.as_str()).await.unwrap(),
            FIXTURE_SECRET.into(), &ORIGIN.parse().unwrap(),
        ).unwrap());
        let admin = ("admin", ORIGIN);
        let lead = ("lead", ORIGIN);
        let guest = ("guest", ORIGIN);
        let outside = ("outsider", ORIGIN);
        let list = format!("{BASE}?projectId={project}");
        let start = "1970-01-01";
        let end = "2199-12-31";
        let input = |project_id, name: &str| json!({"projectId":project_id,"name":name,"start":start,"end":end});
        assert_eq!(request(&app, guest, Method::GET, &list, Value::Null, StatusCode::OK).await, json!([]));
        request(&app, outside, Method::GET, &list, Value::Null, StatusCode::FORBIDDEN).await;
        request(&app, ("agent", ORIGIN), Method::GET, &list, Value::Null, StatusCode::UNAUTHORIZED).await;
        request(&app, admin, Method::GET, &format!("{BASE}?projectId=bad"), Value::Null, StatusCode::BAD_REQUEST).await;
        for identity in [lead, guest, ("admin", "https://foreign.invalid")] {
            request(&app, identity, Method::POST, BASE, input(project, "Denied"), StatusCode::FORBIDDEN).await;
        }
        request(&app, admin, Method::POST, BASE, input(foreign, "Denied"), StatusCode::FORBIDDEN).await;
        let name120 = "界".repeat(120);
        let whitespace = format!(" \u{feff}{name120}\n ");
        for invalid in [
            input(project, "\u{feff}  "),
            input(project, "A\0B"),
            input(project, &"界".repeat(121)),
            json!({"projectId":project,"name":"Too early","start":"1969-12-31","end":end}),
            json!({"projectId":project,"name":"Too late","start":start,"end":"2200-01-01"}),
            json!({"projectId":project,"name":"Reversed","start":end,"end":start}),
            json!({"projectId":project,"name":"Noncanonical","start":"1970-1-1","end":end}),
        ] {
            request(&app, admin, Method::POST, BASE, invalid, StatusCode::BAD_REQUEST).await;
        }
        let (first, second) = tokio::join!(
            request(&app, admin, Method::POST, BASE, input(project, &whitespace), StatusCode::CREATED),
            request(&app, admin, Method::POST, BASE, input(project, "Concurrent"), StatusCode::CREATED),
        );
        assert_eq!(first["name"], name120);
        assert_eq!(first["workspaceId"], json!(workspace));
        assert_eq!(first["projectId"], json!(project));
        assert_eq!(first["start"], start);
        assert_eq!(first["end"], end);
        let mut ordered = [first.clone(),second];
        ordered.sort_by_key(|phase| phase["position"].as_i64().unwrap());
        assert_eq!(ordered[0]["position"], 0);
        assert_eq!(ordered[1]["position"], 1);
        assert_eq!(request(&app, lead, Method::GET, &list, Value::Null, StatusCode::OK).await, json!(ordered));
        let path = format!("{BASE}/{}", first["id"].as_str().unwrap());
        let edit = json!({"name":" Updated ","start":"2026-11-23","end":"2026-11-23"});
        for identity in [lead, outside, ("admin", "https://foreign.invalid")] {
            request(&app, identity, Method::PATCH, &path, edit.clone(), StatusCode::FORBIDDEN).await;
        }
        let edited = request(&app, admin, Method::PATCH, &path, edit.clone(), StatusCode::OK).await;
        assert_eq!(edited["id"], first["id"]);
        assert_eq!(edited["name"], "Updated");
        assert_eq!(edited["position"], first["position"]);
        assert_eq!(edited["start"], "2026-11-23");
        assert_eq!(edited["end"], "2026-11-23");
        sqlx::query(&format!("UPDATE {test_schema}.projects SET archived=true WHERE id=$1"))
            .bind(project).execute(&test_pool).await.unwrap();
        request(&app, admin, Method::POST, BASE, input(project, "Archived"), StatusCode::BAD_REQUEST).await;
        request(&app, admin, Method::PATCH, &path, edit, StatusCode::BAD_REQUEST).await;
        let history = request(&app, guest, Method::GET, &list, Value::Null, StatusCode::OK).await;
        assert_eq!(history.as_array().unwrap().len(), 2);
        assert_eq!(history[first["position"].as_u64().unwrap() as usize], edited);
        let audit: Vec<String> = sqlx::query_scalar(&format!(
            "SELECT action FROM {test_schema}.activity
             WHERE workspace_id=$1 AND actor_id='admin' AND details='{{}}'::jsonb ORDER BY action",
        ))
        .bind(workspace).fetch_all(&test_pool).await.unwrap();
        assert_eq!(audit, ["project_phases.insert","project_phases.insert","project_phases.update"]);
    }).await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
