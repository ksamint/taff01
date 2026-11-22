use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use taff_api::{ApiError, AppState, AuthenticatedSession, router};
use taff_db::Db;
use taff_domain::CoreError;
use tower::ServiceExt;

const TEST_AUTH_SECRET: &str = "taff-rust-session-fixture-secret-not-for-production";

fn fixture_command() -> Command {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let mut command = Command::new("node");
    command.current_dir(root).args([
        "node_modules/tsx/dist/cli.mjs",
        "apps/api/scripts/rust-session-fixture.mts",
    ]);
    command
}

struct Cleanup(String);
impl Drop for Cleanup {
    fn drop(&mut self) {
        let result = (|| -> std::io::Result<_> {
            let mut child = fixture_command()
                .arg("cleanup")
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .spawn()?;
            child.stdin.take().unwrap().write_all(self.0.as_bytes())?;
            child.wait()
        })();
        assert!(
            result.is_ok_and(|status| status.success()) || std::thread::panicking(),
            "Node session fixture cleanup failed"
        );
    }
}

#[derive(Deserialize, Debug, PartialEq)]
struct Outcome {
    status: u16,
    body: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    user_id: String,
    valid_session_id: String,
    expired_session_id: String,
    cookies: BTreeMap<String, String>,
    sessions: BTreeMap<String, Outcome>,
    errors: BTreeMap<u16, Outcome>,
    health: Outcome,
}

async fn outcome(app: &Router, path: &str, cookie: Option<&String>) -> Outcome {
    let mut request = Request::builder().uri(path);
    if let Some(cookie) = cookie {
        request = request.header(header::COOKIE, cookie);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert!(!response.headers().contains_key(header::SET_COOKIE));
    response_outcome(response).await
}

async fn response_outcome(response: Response) -> Outcome {
    let status = response.status().as_u16();
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    Outcome {
        status,
        body: serde_json::from_slice(&body).unwrap(),
    }
}

#[tokio::test]
async fn session_reads_and_errors_match_node() {
    let Ok(database) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "session parity requires TEST_DATABASE_URL"
        );
        return;
    };
    let output = fixture_command()
        .output()
        .expect("start Node session fixture");
    assert!(output.status.success(), "Node session fixture failed");
    let fixture: Fixture = serde_json::from_slice(&output.stdout).expect("invalid Node fixture");
    let _cleanup = Cleanup(fixture.user_id);
    let pool = sqlx::PgPool::connect(&database)
        .await
        .expect("connect to test database");
    let session_ids = [fixture.valid_session_id, fixture.expired_session_id];
    let read_rows = || {
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT id, expires_at::text, updated_at::text FROM sessions WHERE id = ANY($1) ORDER BY id",
        )
        .bind(&session_ids[..])
        .fetch_all(&pool)
    };
    let before = read_rows().await.unwrap();
    assert_eq!(before.len(), 2);

    let state = AppState::new(
        Db::connect(&database)
            .await
            .expect("connect to test database"),
        TEST_AUTH_SECRET.into(),
        &"http://localhost:3000".parse().unwrap(),
    )
    .unwrap();
    let app = router().route(
        "/api/parity-session",
        get(
            |AuthenticatedSession(session): AuthenticatedSession| async move {
                Json(json!({"userId": session.user_id}))
            },
        ),
    );
    for (status, error) in [
        (400, CoreError::InvalidInput),
        (401, CoreError::Unauthorized),
        (403, CoreError::Forbidden),
        (404, CoreError::NotFound),
        (409, CoreError::Conflict),
    ] {
        let result = response_outcome(ApiError(error).into_response()).await;
        assert_eq!(result, fixture.errors[&status]);
    }
    let app = app.with_state(state);
    for name in ["valid", "tampered", "expired", "absent"] {
        assert_eq!(
            outcome(&app, "/api/parity-session", fixture.cookies.get(name)).await,
            fixture.sessions[name],
            "{name}"
        );
    }
    assert_eq!(outcome(&app, "/api/health", None).await, fixture.health);
    assert_eq!(
        read_rows().await.unwrap(),
        before,
        "session check mutated data"
    );
}
