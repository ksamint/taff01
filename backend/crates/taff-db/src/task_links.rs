use crate::{Db, MutationActor};
use sqlx::PgConnection;
use taff_contract::{TaskLink, TaskLinkInput, TaskLinkKind};
use taff_domain::{Action, Actor, CoreError, Resource, Result, Role, can};
use uuid::Uuid;

struct EditableTask {
    workspace_id: Uuid,
    member_id: Uuid,
    actor: Actor,
    title: String,
}

fn database(error: sqlx::Error) -> CoreError {
    CoreError::Other(error.into())
}

fn can_edit(actor: &Actor, task_id: Uuid, owner_id: Uuid) -> bool {
    can(
        Some(actor),
        Action::TaskEdit,
        &Resource {
            workspace_id: Some(actor.workspace_id.clone()),
            task_id: Some(task_id.to_string()),
            owner_id: Some(owner_id.to_string()),
            ..Resource::default()
        },
    )
}

async fn editable_task(
    connection: &mut PgConnection,
    user_id: &str,
    task_id: Uuid,
) -> Result<EditableTask> {
    let row = sqlx::query!(
        r#"
        SELECT tasks.workspace_id, tasks.title, tasks.owner_id,
               members.id AS member_id, members.role::text AS "role!"
        FROM tasks
        JOIN workspaces ON workspaces.id = tasks.workspace_id AND workspaces.archived_at IS NULL
        JOIN members ON members.workspace_id = tasks.workspace_id AND members.user_id = $2
                     AND members.kind = 'person'
        WHERE tasks.id = $1 AND tasks.archived_at IS NULL
        FOR SHARE OF tasks, members, workspaces
        "#,
        task_id,
        user_id,
    )
    .fetch_optional(connection)
    .await
    .map_err(database)?
    .ok_or(CoreError::Forbidden)?;
    let role = match row.role.as_str() {
        "admin" => Role::Admin,
        "member" => Role::Member,
        "guest" => Role::Guest,
        _ => return Err(CoreError::Forbidden),
    };
    let actor = Actor {
        id: row.member_id.to_string(),
        workspace_id: row.workspace_id.to_string(),
        user_id: Some(user_id.to_owned()),
        role,
        ..Actor::default()
    };
    if !can_edit(&actor, task_id, row.owner_id) {
        return Err(CoreError::Forbidden);
    }
    Ok(EditableTask {
        workspace_id: row.workspace_id,
        member_id: row.member_id,
        actor,
        title: row.title,
    })
}

impl Db {
    pub async fn task_links(&self, user_id: &str, task_id: Uuid) -> Result<Vec<TaskLink>> {
        let mut transaction = self.pool.begin().await.map_err(database)?;
        let scope = editable_task(&mut transaction, user_id, task_id).await?;
        let rows = sqlx::query!(
            r#"
            SELECT links.id, links.kind::text AS "kind!", links.from_task_id, links.to_task_id,
                   other.id AS other_task_id, other.title AS other_task_title, other.owner_id
            FROM task_links AS links
            JOIN tasks AS other ON other.workspace_id = links.workspace_id
                AND other.id = CASE WHEN links.from_task_id = $2 THEN links.to_task_id
                                    ELSE links.from_task_id END
                AND other.archived_at IS NULL
            WHERE links.workspace_id = $1 AND (links.from_task_id = $2 OR links.to_task_id = $2)
            ORDER BY links.created_at, links.id
            "#,
            scope.workspace_id,
            task_id,
        )
        .fetch_all(&mut *transaction)
        .await
        .map_err(database)?;
        transaction.commit().await.map_err(database)?;
        rows.into_iter()
            .filter(|row| can_edit(&scope.actor, row.other_task_id, row.owner_id))
            .map(|row| {
                let kind = match row.kind.as_str() {
                    "related" => TaskLinkKind::Related,
                    "duplicate" => TaskLinkKind::Duplicate,
                    _ => {
                        return Err(CoreError::Other(
                            std::io::Error::other("invalid task link kind").into(),
                        ));
                    }
                };
                Ok(TaskLink {
                    id: row.id,
                    kind,
                    from_task_id: row.from_task_id,
                    to_task_id: row.to_task_id,
                    other_task_id: row.other_task_id,
                    other_task_title: row.other_task_title,
                })
            })
            .collect()
    }

    pub async fn create_task_link(&self, user_id: &str, input: TaskLinkInput) -> Result<TaskLink> {
        if input.from_task_id == input.to_task_id {
            return Err(CoreError::InvalidInput);
        }
        let from = input.from_task_id.min(input.to_task_id);
        let to = input.from_task_id.max(input.to_task_id);
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let first = editable_task(connection, user_id, from).await?;
            let second = editable_task(connection, user_id, to).await?;
            if first.workspace_id != second.workspace_id {
                return Err(CoreError::InvalidInput.into());
            }
            let kind = input.kind.as_str();
            let row = sqlx::query!(
                r#"
                INSERT INTO task_links (workspace_id, from_task_id, to_task_id, kind, created_by)
                VALUES ($1, $2, $3, $4::text::task_link_kind, $5)
                ON CONFLICT (workspace_id, from_task_id, to_task_id, kind) DO NOTHING
                RETURNING id
                "#,
                first.workspace_id,
                from,
                to,
                kind,
                first.member_id,
            )
            .fetch_optional(connection)
            .await?
            .ok_or(CoreError::Conflict)?;
            let (other_task_id, other_task_title) = if input.from_task_id == from {
                (to, second.title)
            } else {
                (from, first.title)
            };
            Ok(TaskLink {
                id: row.id,
                kind: input.kind,
                from_task_id: from,
                to_task_id: to,
                other_task_id,
                other_task_title,
            })
        })
        .await
    }

    pub async fn delete_task_link(&self, user_id: &str, link_id: Uuid) -> Result<()> {
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let link = sqlx::query!(
                "SELECT workspace_id, from_task_id, to_task_id FROM task_links WHERE id = $1",
                link_id,
            )
            .fetch_optional(&mut *connection)
            .await?
            .ok_or(CoreError::NotFound)?;
            let first = editable_task(connection, user_id, link.from_task_id).await?;
            let second = editable_task(connection, user_id, link.to_task_id).await?;
            if first.workspace_id != link.workspace_id || second.workspace_id != link.workspace_id {
                return Err(CoreError::Forbidden.into());
            }
            let deleted = sqlx::query!(
                "DELETE FROM task_links WHERE workspace_id = $1 AND id = $2",
                link.workspace_id,
                link_id
            )
            .execute(connection)
            .await?;
            if deleted.rows_affected() == 0 {
                return Err(CoreError::NotFound.into());
            }
            Ok(())
        })
        .await
    }
}
