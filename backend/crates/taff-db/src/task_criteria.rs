use crate::{Db, MutationActor, write::database_error};
use sqlx::PgConnection;
use std::collections::HashSet;
use taff_contract::{TaskCriteriaReorder, TaskCriterion, TaskCriterionInput};
use taff_domain::{Action, Actor, CoreError, Resource, Result, Role, can};
use uuid::Uuid;

struct TaskScope {
    task_id: Uuid,
    workspace_id: Uuid,
    owner_id: Uuid,
    worker_id: Option<Uuid>,
    status: String,
}

impl TaskScope {
    fn resource(&self) -> Resource {
        Resource {
            workspace_id: Some(self.workspace_id.to_string()),
            task_id: Some(self.task_id.to_string()),
            owner_id: Some(self.owner_id.to_string()),
            worker_id: self.worker_id.map(|id| id.to_string()),
            ..Resource::default()
        }
    }
}

async fn lock_task(connection: &mut PgConnection, id: Uuid) -> Result<TaskScope> {
    // Serialize all criteria writes with Node's task and review changes.
    sqlx::query_as!(
        TaskScope,
        r#"SELECT id AS task_id, workspace_id, owner_id, worker_id, status::text AS "status!"
           FROM tasks WHERE id = $1 AND archived_at IS NULL FOR UPDATE"#,
        id,
    )
    .fetch_optional(connection)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)
}

async fn criterion_task(connection: &mut PgConnection, id: Uuid) -> Result<TaskScope> {
    let task_id = sqlx::query_scalar!("SELECT task_id FROM task_criteria WHERE id = $1", id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(database_error)?
        .ok_or(CoreError::NotFound)?;
    lock_task(connection, task_id).await
}

async fn person(
    connection: &mut PgConnection,
    user_id: &str,
    workspace_id: Uuid,
) -> Result<(Uuid, Actor)> {
    let member = sqlx::query!(
        r#"SELECT members.id, members.role::text AS "role!"
           FROM members JOIN workspaces ON workspaces.id = members.workspace_id
           WHERE members.workspace_id = $1 AND members.user_id = $2
             AND members.kind = 'person' AND workspaces.archived_at IS NULL
           FOR SHARE OF members, workspaces"#,
        workspace_id,
        user_id,
    )
    .fetch_optional(connection)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)?;
    let role = match member.role.as_str() {
        "admin" => Role::Admin,
        "member" => Role::Member,
        "guest" => Role::Guest,
        _ => return Err(CoreError::Forbidden),
    };
    Ok((
        member.id,
        Actor {
            id: member.id.to_string(),
            workspace_id: workspace_id.to_string(),
            user_id: Some(user_id.to_owned()),
            role,
            ..Actor::default()
        },
    ))
}

async fn require_editor(
    connection: &mut PgConnection,
    user_id: &str,
    task: &TaskScope,
) -> Result<()> {
    let (_, actor) = person(connection, user_id, task.workspace_id).await?;
    if can(Some(&actor), Action::TaskEdit, &task.resource()) {
        Ok(())
    } else {
        Err(CoreError::Forbidden)
    }
}

async fn review_scope(connection: &mut PgConnection, task: &TaskScope) -> Result<(Resource, bool)> {
    let run = sqlx::query!(
        r#"SELECT id, agent_id, status::text AS "status!" FROM runs
           WHERE task_id = $1 AND workspace_id = $2
           ORDER BY started_at DESC, id DESC LIMIT 1 FOR SHARE"#,
        task.task_id,
        task.workspace_id,
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(database_error)?;
    let Some(run) = run else {
        return Ok((task.resource(), false));
    };
    let supervisor_id = sqlx::query_scalar!(
        r#"SELECT supervisor_id FROM agent_profiles WHERE id = $1 AND workspace_id = $2 FOR SHARE"#,
        run.agent_id,
        task.workspace_id,
    )
    .fetch_optional(connection)
    .await
    .map_err(database_error)?
    .flatten();
    let active = task.status == "needs_review"
        && run.status == "needs_review"
        && task.worker_id == Some(run.agent_id);
    let resource = Resource {
        run_id: Some(run.id.to_string()),
        agent_id: Some(run.agent_id.to_string()),
        worker_id: Some(run.agent_id.to_string()),
        supervisor_id: supervisor_id.map(|id| id.to_string()),
        ..task.resource()
    };
    Ok((resource, active))
}

async fn list(connection: &mut PgConnection, task: &TaskScope) -> Result<Vec<TaskCriterion>> {
    sqlx::query_as!(
        TaskCriterion,
        "SELECT id, workspace_id, task_id, position, text, checked_by, checked_at
         FROM task_criteria WHERE workspace_id = $1 AND task_id = $2 ORDER BY position",
        task.workspace_id,
        task.task_id,
    )
    .fetch_all(connection)
    .await
    .map_err(database_error)
}

fn validate_text(text: &str) -> Result<()> {
    // Match JavaScript trim(), including BOM and excluding NEL.
    let blank = text
        .trim_matches(|c: char| c == '\u{feff}' || (c.is_whitespace() && c != '\u{0085}'))
        .is_empty();
    if blank || text.chars().count() > 300 || text.contains('\0') {
        Err(CoreError::InvalidInput)
    } else {
        Ok(())
    }
}

impl Db {
    pub async fn task_criteria(&self, user_id: &str, task_id: Uuid) -> Result<Vec<TaskCriterion>> {
        let mut transaction = self.pool.begin().await.map_err(database_error)?;
        let task = lock_task(&mut transaction, task_id).await?;
        let (_, actor) = person(&mut transaction, user_id, task.workspace_id).await?;
        if !can(Some(&actor), Action::TaskEdit, &task.resource()) {
            let (resource, active) = review_scope(&mut transaction, &task).await?;
            if !active || !can(Some(&actor), Action::TaskReview, &resource) {
                return Err(CoreError::Forbidden);
            }
        }
        let criteria = list(&mut transaction, &task).await?;
        transaction.commit().await.map_err(database_error)?;
        Ok(criteria)
    }

    pub async fn create_criterion(
        &self,
        user_id: &str,
        input: TaskCriterionInput,
    ) -> Result<TaskCriterion> {
        validate_text(&input.text)?;
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let task = lock_task(connection, input.task_id).await?;
            require_editor(connection, user_id, &task).await?;
            let criterion = sqlx::query_as!(
                TaskCriterion,
                "INSERT INTO task_criteria (workspace_id, task_id, position, text)
                 SELECT $1, $2, COALESCE(max(position) + 1, 0), $3 FROM task_criteria
                 WHERE workspace_id = $1 AND task_id = $2
                 RETURNING id, workspace_id, task_id, position, text, checked_by, checked_at",
                task.workspace_id,
                task.task_id,
                input.text,
            )
            .fetch_one(connection)
            .await?;
            Ok(criterion)
        })
        .await
    }

    pub async fn edit_criterion(
        &self,
        user_id: &str,
        id: Uuid,
        text: String,
    ) -> Result<TaskCriterion> {
        validate_text(&text)?;
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let task = criterion_task(connection, id).await?;
            require_editor(connection, user_id, &task).await?;
            let criterion = sqlx::query_as!(
                TaskCriterion,
                "UPDATE task_criteria SET text = $4
                 WHERE id = $1 AND workspace_id = $2 AND task_id = $3
                   AND (checked_by IS NULL OR text = $4)
                 RETURNING id, workspace_id, task_id, position, text, checked_by, checked_at",
                id,
                task.workspace_id,
                task.task_id,
                text,
            )
            .fetch_optional(connection)
            .await?
            .ok_or(CoreError::Conflict)?;
            Ok(criterion)
        })
        .await
    }

    pub async fn reorder_criteria(
        &self,
        user_id: &str,
        input: TaskCriteriaReorder,
    ) -> Result<Vec<TaskCriterion>> {
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let task = lock_task(connection, input.task_id).await?;
            require_editor(connection, user_id, &task).await?;
            let current = list(connection, &task).await?;
            let ids: HashSet<_> = input.ids.iter().copied().collect();
            if ids.len() != input.ids.len() || current.len() != ids.len()
                || current.iter().any(|criterion| !ids.contains(&criterion.id))
            {
                return Err(CoreError::InvalidInput.into());
            }
            sqlx::query!(
                "UPDATE task_criteria AS criteria SET position = (ordering.ordinality - 1)::integer
                 FROM unnest($3::uuid[]) WITH ORDINALITY AS ordering(id, ordinality)
                 WHERE criteria.workspace_id = $1 AND criteria.task_id = $2 AND criteria.id = ordering.id
                   AND criteria.position <> ordering.ordinality - 1",
                task.workspace_id,
                task.task_id,
                &input.ids,
            )
            .execute(&mut *connection)
            .await?;
            Ok(list(connection, &task).await?)
        }).await
    }

    pub async fn set_criterion_checked(
        &self,
        user_id: &str,
        id: Uuid,
        checked: bool,
    ) -> Result<TaskCriterion> {
        self.mutate(MutationActor::Person(user_id), async move |connection| {
            let task = criterion_task(connection, id).await?;
            let (member, actor) = person(connection, user_id, task.workspace_id).await?;
            let (resource, active) = review_scope(connection, &task).await?;
            if !can(Some(&actor), Action::TaskReview, &resource) {
                return Err(CoreError::Forbidden.into());
            }
            if !active {
                return Err(CoreError::Conflict.into());
            }
            let checked_by = checked.then_some(member);
            let criterion = sqlx::query_as!(
                TaskCriterion,
                "WITH updated AS (
                     UPDATE task_criteria
                     SET checked_by = $4, checked_at = CASE WHEN $4::uuid IS NULL THEN NULL ELSE now() END
                     WHERE id = $1 AND workspace_id = $2 AND task_id = $3
                       AND (checked_by IS NULL) <> ($4::uuid IS NULL)
                     RETURNING id, workspace_id, task_id, position, text, checked_by, checked_at
                 )
                 SELECT id AS \"id!\", workspace_id AS \"workspace_id!\", task_id AS \"task_id!\",
                        position AS \"position!\", text AS \"text!\", checked_by, checked_at
                 FROM updated
                 UNION ALL
                 SELECT id, workspace_id, task_id, position, text, checked_by, checked_at
                 FROM task_criteria WHERE id = $1 AND workspace_id = $2 AND task_id = $3
                   AND NOT EXISTS (SELECT 1 FROM updated)",
                id,
                task.workspace_id,
                task.task_id,
                checked_by,
            )
            .fetch_optional(connection)
            .await?
            .ok_or(CoreError::NotFound)?;
            Ok(criterion)
        }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn criterion_text_is_bounded_in_unicode_characters() {
        assert!(validate_text(&"界".repeat(300)).is_ok());
        assert!(matches!(
            validate_text(&"界".repeat(301)),
            Err(CoreError::InvalidInput)
        ));
        assert!(matches!(
            validate_text(" \u{feff}\n"),
            Err(CoreError::InvalidInput)
        ));
        assert!(validate_text("\u{0085}").is_ok());
    }
}
