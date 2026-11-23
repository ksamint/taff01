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

const FIXTURE_SECRET: &str = "taff-timeline-read-fixture-secret-not-for-production";

async fn read(app: &Router, user: &str, project: &str, route: &str, status: StatusCode) -> Value {
    let mut request = Request::builder().uri(format!("/api/projects/{project}/{route}"));
    if user == "agent" {
        request = request.header(header::AUTHORIZATION, "Bearer fixture");
    } else {
        let token = format!("timeline-fixture-{user}");
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
    let body = to_bytes(response.into_body(), 32768).await.unwrap();
    assert_eq!(actual, status, "{user} {project}/{route}: {body:?}");
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn timeline_milestone_and_payment_reads_preserve_scope_and_wire_fields() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "timeline API test requires TEST_DATABASE_URL"
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
        "timeline API test requires a loopback _test database"
    );
    let pool = PgPool::connect_with(options).await.unwrap();
    let schema = format!("timeline_{}", Uuid::new_v4().simple());
    let [
        workspace,
        outside,
        archived_workspace,
        project,
        other_project,
        archived_project,
        empty_project,
        task,
        fixed,
        archived_task,
        earlier,
        later,
        archived_milestone,
        dependency,
    ] = std::array::from_fn(|_| Uuid::new_v4());
    let mut fixture = pool.begin().await.unwrap();
    sqlx::raw_sql(&format!(
        "CREATE SCHEMA {schema}; SET LOCAL search_path TO {schema}"
    ))
    .execute(&mut *fixture)
    .await
    .unwrap();
    for table in [
        "users",
        "sessions",
        "workspaces",
        "members",
        "projects",
        "tasks",
        "task_plans",
        "grants",
        "milestones",
        "task_dependencies",
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
        "INSERT INTO users (id,name,email,tz)
         VALUES ('owner','Owner','owner@fixture.invalid','america/los_angeles'),
                ('member','Member','member@fixture.invalid','UTC'),
                ('admin','Admin','admin@fixture.invalid','UTC'),
                ('guest','Guest','guest@fixture.invalid','Asia/Singapore'),
                ('outsider','Outside','outside@fixture.invalid','UTC')",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at)
         SELECT id, id, 'timeline-fixture-' || id, now() + interval '1 hour' FROM users",
    )
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id,name,archived_at)
         VALUES ($1,'Timeline',NULL), ($2,'Outside',NULL), ($3,'Archived',now())",
    )
    .bind(workspace)
    .bind(outside)
    .bind(archived_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO members (workspace_id,user_id,name,kind,role)
         VALUES ($1,'owner','Owner','person','member'), ($1,'member','Member','person','member'),
                ($1,'admin','Admin','person','admin'), ($1,'guest','Guest','person','guest'),
                ($1,NULL,'Agent','agent','member'), ($2,'outsider','Outsider','person','admin'),
                ($3,'owner','Archived role','person','admin')",
    )
    .bind(workspace)
    .bind(outside)
    .bind(archived_workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id,workspace_id,name,contract_amount,currency,archived)
         VALUES ($1,$5,'Timeline',20.00,'USD',false), ($2,$6,'Outside',NULL,NULL,false),
                ($3,$7,'Archived workspace',NULL,NULL,false), ($4,$5,'Archived project',NULL,NULL,true)",
    )
    .bind(project).bind(other_project).bind(archived_project).bind(empty_project)
    .bind(workspace).bind(outside).bind(archived_workspace)
    .execute(&mut *fixture).await.unwrap();
    sqlx::query(
        "INSERT INTO tasks (id,workspace_id,project_id,title,number,owner_id,worker_id,parent_id,due_at,archived_at)
         VALUES ($1,$4,$5,'Unplanned deadline',1,(SELECT id FROM members WHERE workspace_id = $4 AND user_id = 'owner'),
                 (SELECT id FROM members WHERE workspace_id = $4 AND kind = 'agent'),NULL,'2026-02-03 02:00:00Z',NULL),
                ($2,$4,$5,'Planned child',2,(SELECT id FROM members WHERE workspace_id = $4 AND user_id = 'owner'),
                 NULL,$1,NULL,NULL),
                ($3,$4,$5,'Archived task',3,(SELECT id FROM members WHERE workspace_id = $4 AND user_id = 'owner'),
                 NULL,NULL,NULL,now())",
    )
    .bind(task).bind(fixed).bind(archived_task).bind(workspace).bind(project)
    .execute(&mut *fixture).await.unwrap();
    sqlx::query(
        "INSERT INTO task_plans (id,workspace_id,start_date,duration_days)
         VALUES ($1,$2,DATE '2026-02-01',2)",
    )
    .bind(fixed)
    .bind(workspace)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO grants (workspace_id,agent_id,task_id,capability,reason)
         SELECT $1,id,$2,'tasks.read','Pending fixture' FROM members WHERE workspace_id = $1 AND kind = 'agent'",
    )
    .bind(workspace).bind(task).execute(&mut *fixture).await.unwrap();
    sqlx::query(
        "INSERT INTO milestones (id,workspace_id,project_id,name,date,created_at,updated_at,archived_at)
         VALUES ($1,$4,$5,'First',DATE '2026-02-05','2026-01-01T00:00:00.135728Z','2026-01-01T00:00:00Z',NULL),
                ($2,$4,$5,'Second',DATE '2026-02-06','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL),
                ($3,$4,$5,'Archived',DATE '2026-01-01','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',now())",
    )
    .bind(earlier).bind(later).bind(archived_milestone).bind(workspace).bind(project)
    .execute(&mut *fixture).await.unwrap();
    sqlx::query(
        "INSERT INTO task_dependencies (id,workspace_id,predecessor_task_id,successor_milestone_id)
         VALUES ($1,$2,$3,$4)",
    )
    .bind(dependency)
    .bind(workspace)
    .bind(fixed)
    .bind(earlier)
    .execute(&mut *fixture)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_payments (workspace_id,project_id,amount,paid_on,created_by,note,created_at)
         SELECT $1,$2,data.amount,data.date,members.id,data.note,data.created_at
         FROM (VALUES (12.30,DATE '2026-01-05','Later','2026-01-08T00:00:00Z'::timestamptz),
                      (1.01,DATE '2026-01-01','Second on same day','2026-01-02T00:00:00Z'::timestamptz),
                      (0.02,DATE '2026-01-01','Earlier','2026-01-01T00:00:00.723452Z'::timestamptz))
         AS data(amount,date,note,created_at)
         JOIN members ON members.workspace_id = $1 AND members.user_id = 'admin'",
    )
    .bind(workspace).bind(project)
    .execute(&mut *fixture).await.unwrap();
    fixture.commit().await.unwrap();

    let mut scoped: url::Url = database.parse().unwrap();
    scoped
        .query_pairs_mut()
        .append_pair("options[search_path]", &schema);
    let result = tokio::spawn(async move {
        let app = router().with_state(
            AppState::new(
                Db::connect(scoped.as_str()).await.unwrap(),
                FIXTURE_SECRET.into(),
                &"http://localhost:3000".parse().unwrap(),
            )
            .unwrap(),
        );
        let raw = project.to_string().to_ascii_uppercase();
        let model = read(&app, "owner", &raw, "timeline", StatusCode::OK).await;
        assert_eq!(model["projectId"], raw);
        assert_eq!(model["timeZone"], "america/los_angeles");
        assert_eq!(model["canEditPlan"], true);
        assert_eq!(model["risk"]["finance"]["collectedAmount"], "13.33");
        assert_eq!(model["risk"]["finance"]["contractAmount"], "20.00");
        let items = model["items"].as_array().unwrap();
        assert_eq!(items.len(), 4);
        let task_item = items.iter().find(|item| item["id"] == json!(task)).unwrap();
        assert_eq!(task_item["workerIsAgent"], true);
        assert_eq!(task_item["blocked"], true);
        let child = items
            .iter()
            .find(|item| item["id"] == json!(fixed))
            .unwrap();
        assert_eq!(child["parentId"], json!(task));
        assert_eq!(child["planned"], true);
        assert_eq!(model["dependencies"][0]["id"], json!(dependency));

        let member = read(&app, "member", &raw, "timeline", StatusCode::OK).await;
        assert_eq!(member["canEditPlan"], false);
        let guest = read(&app, "guest", &raw, "timeline", StatusCode::OK).await;
        assert_eq!(guest["timeZone"], "Asia/Singapore");
        assert_eq!(guest["canEditPlan"], false);
        assert_eq!(guest["risk"].get("finance"), Some(&Value::Null));
        let admin_empty = read(
            &app,
            "admin",
            &empty_project.to_string(),
            "timeline",
            StatusCode::OK,
        )
        .await;
        assert_eq!(admin_empty["canEditPlan"], true);
        assert_eq!(admin_empty["items"], json!([]));

        let milestone_rows = read(&app, "guest", &raw, "milestones", StatusCode::OK).await;
        assert_eq!(milestone_rows.as_array().unwrap().len(), 2);
        assert_eq!(milestone_rows[0]["id"], json!(earlier));
        assert_eq!(milestone_rows[0]["projectId"], json!(project));
        assert_eq!(milestone_rows[0]["createdAt"], "2026-01-01T00:00:00.135Z");
        assert_eq!(milestone_rows[0].get("archivedAt"), Some(&Value::Null));
        assert_eq!(milestone_rows[1]["id"], json!(later));

        let payments = read(&app, "member", &raw, "payments", StatusCode::OK).await;
        assert_eq!(payments.as_array().unwrap().len(), 3);
        assert_eq!(payments[0]["amount"], "0.02");
        assert_eq!(payments[0]["createdAt"], "2026-01-01T00:00:00.723Z");
        assert_eq!(payments[1]["amount"], "1.01");
        assert_eq!(payments[2]["amount"], "12.30");
        assert_eq!(
            read(&app, "guest", &raw, "payments", StatusCode::FORBIDDEN).await,
            json!({"error":"forbidden"})
        );

        for route in ["timeline", "milestones", "payments"] {
            for (user, id, status, code) in [
                (
                    "agent",
                    raw.clone(),
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                ),
                ("outsider", raw.clone(), StatusCode::FORBIDDEN, "forbidden"),
                (
                    "owner",
                    other_project.to_string(),
                    StatusCode::FORBIDDEN,
                    "forbidden",
                ),
                (
                    "owner",
                    archived_project.to_string(),
                    StatusCode::FORBIDDEN,
                    "forbidden",
                ),
                (
                    "owner",
                    Uuid::new_v4().to_string(),
                    StatusCode::NOT_FOUND,
                    "not_found",
                ),
                (
                    "owner",
                    project.simple().to_string(),
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                ),
                (
                    "owner",
                    "ffffffff-ffff-ffff-ffff-ffffffffffff".into(),
                    StatusCode::NOT_FOUND,
                    "not_found",
                ),
                (
                    "owner",
                    "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF".into(),
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                ),
            ] {
                assert_eq!(
                    read(&app, user, &id, route, status).await,
                    json!({"error":code})
                );
            }
        }
    })
    .await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&pool)
        .await
        .unwrap();
    result.unwrap();
}
