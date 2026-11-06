mod schema;
pub use schema::{User, Workspace};
use taff_domain::{CoreError, Result};

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
    /// Connects with a bounded pool and an independent 20 s read deadline.
    /// Node connectDatabase currently bounds its pool to 10 without a statement timeout.
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
            .await
            .map_err(|e| CoreError::Other(e.into()))?;
        Ok(Self { pool })
    }

    /// Verifies connectivity; mirrors the API `/api/health` read.
    pub async fn ping(&self) -> Result<()> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map_err(|e| CoreError::Other(e.into()))?;
        Ok(())
    }

    /// Reads a workspace by id, including archived rows; callers enforce archive visibility.
    pub async fn workspace(&self, id: Uuid) -> Result<Option<Workspace>> {
        let row = sqlx::query_as::<_, Workspace>(
            "SELECT id, name, key, personal_owner_id, ai_enabled, seed_key, archived_at, created_at, updated_at \
             FROM workspaces WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| CoreError::Other(e.into()))?;
        Ok(row)
    }

    /// Raw read model only; an eventual adapter must perform its normal authorization first.
    pub async fn user(&self, id: &str) -> Result<Option<User>> {
        sqlx::query_as::<_, User>("SELECT id,name,email,email_verified,image,username,system_admin,default_workspace_id,phone_number,phone_number_verified,locale,tz,created_at,updated_at FROM users WHERE id=$1")
            .bind(id).fetch_optional(&self.pool).await.map_err(|error| CoreError::Other(error.into()))
    }

    /// Lists workspace ids (bounded) — used by the migration parity tests to
    /// enumerate the existing seed data without assuming any local ordering.
    pub async fn workspace_ids(&self, limit: i64) -> Result<Vec<Uuid>> {
        let rows: Vec<(Uuid,)> =
            sqlx::query_as("SELECT id FROM workspaces ORDER BY created_at ASC, id ASC LIMIT $1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| CoreError::Other(e.into()))?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}
