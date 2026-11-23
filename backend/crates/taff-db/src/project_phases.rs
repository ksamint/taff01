use crate::{Db, MutationActor, project_health::require_project, write::database_error};
use chrono::{Datelike, NaiveDate};
use sqlx::PgConnection;
use taff_contract::{ProjectPhase, ProjectPhaseEdit, ProjectPhaseInput};
use taff_domain::{Action, CoreError, Result};
use uuid::Uuid;

fn validated_name(name: &str, start: NaiveDate, end: NaiveDate) -> Result<&str> {
    // Keep whitespace handling consistent with the browser's String.trim().
    let name =
        name.trim_matches(|ch: char| ch == '\u{feff}' || (ch.is_whitespace() && ch != '\u{0085}'));
    if name.is_empty()
        || name.chars().count() > 120
        || name.contains('\0')
        || start.year() < 1970
        || end.year() > 2199
        || start > end
    {
        return Err(CoreError::InvalidInput);
    }
    Ok(name)
}

async fn managed_project(
    connection: &mut PgConnection,
    user_id: &str,
    project_id: Uuid,
) -> Result<Uuid> {
    // All phase writes take this lock before the permission helper locks the
    // project for sharing, so concurrent appends never upgrade shared locks.
    let archived = sqlx::query_scalar!(
        "SELECT archived FROM projects WHERE id = $1 FOR NO KEY UPDATE",
        project_id,
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)?;
    let (workspace_id, _) =
        require_project(connection, user_id, project_id, Action::ProjectManage).await?;
    if archived {
        return Err(CoreError::InvalidInput);
    }
    Ok(workspace_id)
}

impl Db {
    pub async fn project_phases(
        &self,
        user_id: &str,
        project_id: Uuid,
    ) -> Result<Vec<ProjectPhase>> {
        let mut tx = self.pool.begin().await.map_err(database_error)?;
        let (workspace_id, _) =
            require_project(&mut tx, user_id, project_id, Action::WorkspaceRead).await?;
        let phases = sqlx::query_as!(
            ProjectPhase,
            r#"SELECT id, workspace_id, project_id, name, position,
                      start_date AS start, end_date AS "end"
               FROM project_phases WHERE workspace_id = $1 AND project_id = $2
               ORDER BY position"#,
            workspace_id,
            project_id,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?;
        tx.commit().await.map_err(database_error)?;
        Ok(phases)
    }

    pub async fn create_project_phase(
        &self,
        user_id: &str,
        input: ProjectPhaseInput,
    ) -> Result<ProjectPhase> {
        let name = validated_name(&input.name, input.start, input.end)?;
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let workspace_id = managed_project(tx, user_id, input.project_id).await?;
            let phase = sqlx::query_as!(
                ProjectPhase,
                r#"INSERT INTO project_phases (workspace_id, project_id, name, position, start_date, end_date)
                   SELECT $1, $2, $3, coalesce(max(position) + 1, 0), $4, $5
                   FROM project_phases WHERE workspace_id = $1 AND project_id = $2
                   RETURNING id, workspace_id, project_id, name, position, start_date AS start, end_date AS "end""#,
                workspace_id,
                input.project_id,
                name,
                input.start,
                input.end,
            )
            .fetch_one(tx)
            .await?;
            Ok(phase)
        })
        .await
    }

    pub async fn edit_project_phase(
        &self,
        user_id: &str,
        id: Uuid,
        input: ProjectPhaseEdit,
    ) -> Result<ProjectPhase> {
        let name = validated_name(&input.name, input.start, input.end)?;
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let project_id = sqlx::query_scalar!("SELECT project_id FROM project_phases WHERE id = $1", id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(CoreError::NotFound)?;
            let workspace_id = managed_project(tx, user_id, project_id).await?;
            let phase = sqlx::query_as!(
                ProjectPhase,
                r#"UPDATE project_phases SET name = $4, start_date = $5, end_date = $6
                   WHERE id = $1 AND workspace_id = $2 AND project_id = $3
                   RETURNING id, workspace_id, project_id, name, position, start_date AS start, end_date AS "end""#,
                id,
                workspace_id,
                project_id,
                name,
                input.start,
                input.end,
            )
            .fetch_optional(tx)
            .await?
            .ok_or(CoreError::NotFound)?;
            Ok(phase)
        })
        .await
    }
}
