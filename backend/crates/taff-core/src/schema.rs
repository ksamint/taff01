use chrono::{DateTime, Utc};
use sqlx::prelude::FromRow;
use uuid::Uuid;

/// Read model for the `workspaces` table in `packages/db` (schema.ts).
/// This is the first slice of the Rust read path: it mirrors the existing
/// PostgreSQL schema exactly, so a parity test can compare it against the
/// TypeScript `Core` output.
#[derive(Debug, Clone, serde::Serialize, FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Read model for the `users` table. Matches `packages/db` `user` (the table
/// is named `users`).
#[derive(Debug, Clone, serde::Serialize, FromRow)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    pub system_admin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_workspace_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    pub phone_number_verified: bool,
    pub locale: String,
    pub tz: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
