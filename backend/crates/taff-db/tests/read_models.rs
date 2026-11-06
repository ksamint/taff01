//! Node owns disposable fixture writes; Rust reads the same rows from the actual migrated schema.
use serde_json::Value;
use std::{path::PathBuf, process::Command};
use taff_db::Db;
use uuid::Uuid;
fn fixture_command() -> Command {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let mut command = Command::new("node");
    command.current_dir(&root).args([
        "node_modules/tsx/dist/cli.mjs",
        "backend/crates/taff-db/tests/read-model-fixture.mts",
    ]);
    command
}
struct Cleanup(String);
impl Drop for Cleanup {
    fn drop(&mut self) {
        let status = fixture_command()
            .args(["cleanup", &self.0])
            .status()
            .expect("run Node fixture cleanup");
        assert!(status.success(), "Node fixture cleanup failed");
    }
}
fn node_precision(mut row: Value) -> Value {
    for key in ["createdAt", "updatedAt", "archivedAt"] {
        if let Some(text) = row[key].as_str() {
            row[key] = Value::String(
                chrono::DateTime::parse_from_rfc3339(text)
                    .unwrap()
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            );
        }
    }
    row
}
#[tokio::test]
async fn sql_read_models_match_node_fixture() {
    let url = match std::env::var("TEST_DATABASE_URL") {
        Ok(url) => url,
        Err(_) => {
            assert!(
                std::env::var("TAFF_REQUIRE_SQL_PARITY").is_err(),
                "rust:gate requires TEST_DATABASE_URL"
            );
            eprintln!("SQL parity skipped: TEST_DATABASE_URL not set");
            return;
        }
    };
    let output = fixture_command()
        .output()
        .expect("run Node fixture generator");
    assert!(
        output.status.success(),
        "Node fixture setup failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).unwrap();
    let raw = stdout
        .lines()
        .find_map(|line| line.strip_prefix("TAFF_DB_FIXTURE="))
        .expect("Node fixture JSON");
    let fixture: Value = serde_json::from_str(raw).unwrap();
    let _cleanup = Cleanup(serde_json::to_string(&fixture).unwrap());
    let db = Db::connect(&url).await.unwrap();
    db.ping().await.unwrap();
    let person = db
        .user(fixture["userId"].as_str().unwrap())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        node_precision(serde_json::to_value(person).unwrap()),
        fixture["user"]
    );
    for expected in fixture["workspaces"].as_array().unwrap() {
        let row = db
            .workspace(Uuid::parse_str(expected["id"].as_str().unwrap()).unwrap())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            node_precision(serde_json::to_value(row).unwrap()),
            *expected
        );
    }
    assert_eq!(
        serde_json::to_value(db.workspace_ids(5).await.unwrap()).unwrap(),
        fixture["firstWorkspaceIds"]
    );
    assert!(db.workspace(Uuid::new_v4()).await.unwrap().is_none());
    assert!(
        db.user(&Uuid::new_v4().to_string())
            .await
            .unwrap()
            .is_none()
    );
}
