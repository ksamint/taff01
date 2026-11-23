use crate::{Db, MutationActor};
use chrono::{DateTime, Utc};
use sqlx::PgConnection;
use taff_contract::{ProjectHealth, ProjectHealthInput, ProjectHealthPage, ProjectHealthUpdate};
use taff_domain::{Action, Actor, CoreError, Resource, Result, Role, can};
use uuid::Uuid;

struct UpdateRow {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    author_id: Uuid,
    health: String,
    body: String,
    created_at: DateTime<Utc>,
}

fn database(error: sqlx::Error) -> CoreError {
    CoreError::Other(error.into())
}

fn update(row: UpdateRow) -> Result<ProjectHealthUpdate> {
    let health = serde_json::from_value::<ProjectHealth>(serde_json::Value::String(row.health))
        .map_err(|error| CoreError::Other(error.into()))?;
    Ok(ProjectHealthUpdate {
        id: row.id,
        workspace_id: row.workspace_id,
        project_id: row.project_id,
        author_id: row.author_id,
        health,
        body: row.body,
        created_at: row.created_at,
    })
}

async fn require_project(
    connection: &mut PgConnection,
    user_id: &str,
    project_id: Uuid,
    action: Action,
) -> Result<(Uuid, Uuid)> {
    let scope = sqlx::query!(
        r#"
        SELECT projects.workspace_id, projects.lead_id, members.id AS member_id,
               members.role::text AS "role!"
        FROM projects
        JOIN workspaces ON workspaces.id = projects.workspace_id AND workspaces.archived_at IS NULL
        JOIN members ON members.workspace_id = projects.workspace_id
                     AND members.user_id = $2 AND members.kind = 'person'
        WHERE projects.id = $1
        FOR SHARE OF projects, members, workspaces
        "#,
        project_id,
        user_id
    )
    .fetch_optional(connection)
    .await
    .map_err(database)?
    .ok_or(CoreError::Forbidden)?;
    let role = match scope.role.as_str() {
        "admin" => Role::Admin,
        "member" => Role::Member,
        "guest" => Role::Guest,
        _ => return Err(CoreError::Forbidden),
    };
    let workspace_id = scope.workspace_id.to_string();
    let actor = Actor {
        id: scope.member_id.to_string(),
        workspace_id: workspace_id.clone(),
        user_id: Some(user_id.to_owned()),
        role,
        ..Actor::default()
    };
    let resource = Resource {
        workspace_id: Some(workspace_id),
        lead_id: scope.lead_id.map(|id| id.to_string()),
        ..Resource::default()
    };
    if !can(Some(&actor), action, &resource) {
        return Err(CoreError::Forbidden);
    }
    Ok((scope.workspace_id, scope.member_id))
}

impl Db {
    pub async fn project_health(
        &self,
        user_id: &str,
        project_id: Uuid,
        before: Option<Uuid>,
    ) -> Result<ProjectHealthPage> {
        let mut transaction = self.pool.begin().await.map_err(database)?;
        let (workspace, _) =
            require_project(&mut transaction, user_id, project_id, Action::WorkspaceRead).await?;
        let rows = sqlx::query_as!(
            UpdateRow,
            r#"
            SELECT id, workspace_id, project_id, author_id, health::text AS "health!", body, created_at
            FROM project_updates
            WHERE workspace_id = $1 AND project_id = $2
              AND ($3::uuid IS NULL OR (created_at, id) < (
                  SELECT created_at, id FROM project_updates
                  WHERE workspace_id = $1 AND project_id = $2 AND id = $3
              ))
            ORDER BY created_at DESC, id DESC
            LIMIT 21
            "#,
            workspace,
            project_id,
            before
        )
        .fetch_all(&mut *transaction)
        .await
        .map_err(database)?;
        transaction.commit().await.map_err(database)?;
        let next_cursor = (rows.len() > 20).then(|| rows[19].id);
        let updates = rows
            .into_iter()
            .take(20)
            .map(update)
            .collect::<Result<_>>()?;
        Ok(ProjectHealthPage {
            updates,
            next_cursor,
        })
    }

    pub async fn post_project_health(
        &self,
        user_id: &str,
        input: ProjectHealthInput,
    ) -> Result<ProjectHealthUpdate> {
        if input.body.contains('\0') || input.body.chars().count() > 2000 {
            return Err(CoreError::InvalidInput);
        }
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let (workspace, author) = require_project(
                connection,
                user_id,
                input.project_id,
                Action::ProjectHealthPost,
            )
            .await?;
            let row = sqlx::query_as!(
                UpdateRow,
                r#"
                INSERT INTO project_updates (workspace_id, project_id, author_id, health, body)
                VALUES ($1, $2, $3, $4::text::project_health, $5)
                RETURNING id, workspace_id, project_id, author_id, health::text AS "health!", body, created_at
                "#,
                workspace,
                input.project_id,
                author,
                input.health.as_str(),
                input.body
            )
            .fetch_one(connection)
            .await?;
            Ok(update(row)?)
        })
        .await
    }
}
