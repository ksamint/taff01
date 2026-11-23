use crate::Db;
use sqlx::PgConnection;
use taff_domain::{CoreError, Result};
use uuid::Uuid;

/// Trusted identity of the requester, resolved before starting a write.
#[derive(Clone, Copy)]
pub enum MutationActor<'a> {
    Person(&'a str),
    Agent(Uuid),
}

#[derive(Debug, thiserror::Error)]
pub enum MutationError {
    #[error(transparent)]
    Domain(#[from] CoreError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

fn database_error(error: sqlx::Error) -> CoreError {
    match error.as_database_error().map(|error| error.message()) {
        Some("taff_conflict") => CoreError::Conflict,
        Some("taff_invalid") => CoreError::InvalidInput,
        _ => CoreError::Other(error.into()),
    }
}

impl Db {
    /// Runs one audited mutation. PostgreSQL triggers write activity and send
    /// `taff_changes` on commit. The operation must check authority in this transaction.
    pub async fn mutate<T>(
        &self,
        actor: MutationActor<'_>,
        operation: impl AsyncFnOnce(&mut PgConnection) -> std::result::Result<T, MutationError>,
    ) -> Result<T> {
        let actor_id = match actor {
            MutationActor::Person(user_id) => user_id.to_owned(),
            MutationActor::Agent(member_id) => format!("agent:{member_id}"),
        };
        let mut transaction = self.pool.begin().await.map_err(database_error)?;
        sqlx::query!(
            "SELECT set_config('taff.actor_id', $1, true) AS actor_id, pg_advisory_xact_lock_shared(hashtextextended('taff:workspace-lifecycle', 0))::text AS lifecycle_lock",
            actor_id
        )
        .fetch_one(&mut *transaction)
        .await
        .map_err(database_error)?;
        if let MutationActor::Agent(member_id) = actor {
            sqlx::query!("SELECT id FROM members WHERE id = $1 FOR SHARE", member_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(database_error)?
                .ok_or(CoreError::Forbidden)?;
        }
        let result = operation(&mut transaction)
            .await
            .map_err(|error| match error {
                MutationError::Domain(domain) => domain,
                MutationError::Database(database) => database_error(database),
            })?;
        transaction.commit().await.map_err(database_error)?;
        Ok(result)
    }
}
