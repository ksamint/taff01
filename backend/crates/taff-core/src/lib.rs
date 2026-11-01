mod calendar;
mod error;
mod permissions;
mod schema;
mod security;
mod tz;

pub use calendar::normalize_rrule;
pub use error::{CoreError, Result};
pub use permissions::{
    Action, Actor, Capability, Grant, GrantStatus, MemberKind, PermissionDecision, Resource,
    ReviewPolicy, Role, Scope, TaskStatus, can, can_grant_oauth_scopes, scope_name,
};
pub use schema::{User, Workspace};
pub use security::{canonical_json, hash_token};
pub use tz::{CivilDateTime, civil_datetime, wall_to_instant};

use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

/// A read-only handle to the Taff database. Phase 1 of the migration: this
/// connects and reads the existing `packages/db` schema but never writes,
/// so `packages/core` remains the sole authority for mutations.
#[derive(Clone)]
pub struct Db {
    pool: PgPool,
}

impl Db {
    /// Connects with a bounded pool and a statement timeout, mirroring the
    /// 20 s deadline that `packages/core` applies (`connectDatabase(url, 20_000)`).
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .after_connect(|conn, _meta| {
                Box::pin(async move {
                    // Default statement deadline (milestone 83); migration and
                    // explicit-URL callers keep their own policy.
                    sqlx::query("SET statement_timeout = 20000")
                        .execute(conn)
                        .await?;
                    Ok(())
                })
            })
            .connect(url)
            .await?;
        Ok(Self { pool })
    }

    /// Verifies connectivity; mirrors the API `/api/health` read.
    pub async fn ping(&self) -> Result<()> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    /// Reads a single workspace by id, or `None` when absent or archived is
    /// still returned (callers decide the archive policy, matching core).
    pub async fn workspace(&self, id: Uuid) -> Result<Option<Workspace>> {
        let row = sqlx::query_as::<_, Workspace>(
            "SELECT id, name, seed_key, archived_at, created_at, updated_at \
             FROM workspaces WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Lists workspace ids (bounded) — used by the migration parity tests to
    /// enumerate the existing seed data without assuming any local ordering.
    pub async fn workspace_ids(&self, limit: i64) -> Result<Vec<Uuid>> {
        let rows: Vec<(Uuid,)> =
            sqlx::query_as("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT $1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// No live database required at unit-test time: assert the error
    /// envelope maps to the same machine codes and statuses the API emits.
    #[test]
    fn error_codes_match_the_wire_contract() {
        assert_eq!(CoreError::InvalidInput.status(), 400);
        assert_eq!(CoreError::InvalidInput.code(), "invalid_input");
        assert_eq!(CoreError::Unauthorized.status(), 401);
        assert_eq!(CoreError::Forbidden.status(), 403);
        assert_eq!(CoreError::NotFound.status(), 404);
        assert_eq!(CoreError::Conflict.status(), 409);
        assert_eq!(CoreError::Database(sqlx::Error::PoolTimedOut).status(), 500);
    }
}
