use serde_json::Value;
use sqlx::{PgConnection, PgPool, postgres::PgListener};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};
use taff_db::{Db, MutationActor, MutationError};
use taff_domain::CoreError;
use tokio::time::timeout;

fn fixture_command() -> Command {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let mut command = Command::new("node");
    command.current_dir(root).args([
        "node_modules/tsx/dist/cli.mjs",
        "backend/crates/taff-db/tests/write-fixture.mts",
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
            "write fixture cleanup failed"
        );
    }
}

async fn next_event(listener: &mut PgListener, resource_id: &str) -> Value {
    loop {
        let message = listener.recv().await.expect("receive change notification");
        let event: Value = serde_json::from_str(message.payload()).expect("change JSON");
        if event["resourceId"] == resource_id {
            return event;
        }
    }
}

async fn update_project(
    connection: &mut PgConnection,
    schema: &str,
    resource_id: &str,
    name: &str,
) -> Result<(), MutationError> {
    sqlx::query("SELECT set_config('search_path', $1, true)")
        .bind(format!("{schema}, public"))
        .execute(&mut *connection)
        .await?;
    let updated = sqlx::query("UPDATE projects SET name = $1 WHERE id::text = $2")
        .bind(name)
        .bind(resource_id)
        .execute(connection)
        .await?;
    assert_eq!(updated.rows_affected(), 1);
    Ok(())
}

#[tokio::test]
async fn mutations_match_node_audit_and_notify_only_on_commit() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        assert!(
            std::env::var_os("TAFF_REQUIRE_SQL_PARITY").is_none(),
            "write parity requires TEST_DATABASE_URL"
        );
        return;
    };
    let output = fixture_command()
        .output()
        .expect("start Node write fixture");
    assert!(output.status.success(), "Node write fixture failed");
    let stdout = std::str::from_utf8(&output.stdout).expect("fixture output");
    let fixture: Value = serde_json::from_str(
        stdout
            .lines()
            .find_map(|line| line.strip_prefix("TAFF_DB_WRITE_FIXTURE="))
            .expect("missing write fixture"),
    )
    .expect("fixture JSON");
    let schema = fixture["schema"].as_str().unwrap();
    assert!(
        schema.starts_with("taff_")
            && schema
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    );
    let _cleanup = Cleanup(schema.into());
    let resource_id = fixture["resourceId"].as_str().unwrap();
    let actor = MutationActor::Person(fixture["actorId"].as_str().unwrap());
    let db = Db::connect(&url).await.expect("connect test database");
    let pool = PgPool::connect(&url).await.expect("connect test database");
    let mut listener = PgListener::connect_with(&pool).await.unwrap();
    listener.listen("taff_changes").await.unwrap();

    db.mutate(actor, async move |connection| {
        update_project(connection, schema, resource_id, "rust").await
    })
    .await
    .unwrap();
    let rust_event = timeout(
        Duration::from_secs(5),
        next_event(&mut listener, resource_id),
    )
    .await
    .expect("Rust mutation notification");
    let activity_query = format!("SELECT to_jsonb(activity) FROM {schema}.activity ORDER BY id");
    let rows: Vec<Value> = sqlx::query_scalar(&activity_query)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    let rust_row = rows
        .iter()
        .find(|row| row["id"] == rust_event["activityId"])
        .expect("Rust event links to its activity row");
    assert_ne!(rust_row["id"], fixture["activity"]["id"]);
    assert_eq!(fixture["activity"]["id"], fixture["event"]["activityId"]);

    let without = |value: &Value, keys: &[&str]| {
        let mut fields = value.as_object().unwrap().clone();
        for key in keys {
            fields.remove(*key);
        }
        fields
    };
    assert_eq!(
        without(rust_row, &["id", "created_at"]),
        without(&fixture["activity"], &["id", "created_at"])
    );
    assert_eq!(
        without(&rust_event, &["activityId"]),
        without(&fixture["event"], &["activityId"])
    );

    let rollback = db
        .mutate(actor, async move |connection| {
            update_project(connection, schema, resource_id, "rolled back").await?;
            Err::<(), _>(CoreError::Forbidden.into())
        })
        .await;
    assert!(matches!(rollback, Err(CoreError::Forbidden)));
    let after: Vec<Value> = sqlx::query_scalar(&activity_query)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(after, rows);
    let project: String = sqlx::query_scalar(&format!("SELECT name FROM {schema}.projects"))
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(project, "rust");
    assert!(
        timeout(
            Duration::from_millis(100),
            next_event(&mut listener, resource_id)
        )
        .await
        .is_err()
    );
}
