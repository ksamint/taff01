use crate::Db;
use taff_contract::{AgentCost, MAX_AGENT_COST_TOTAL};
use taff_domain::{Action, Actor, CoreError, Resource, Result, Role, can};
use uuid::Uuid;

pub enum CostTarget {
    Task(Uuid),
    Project(Uuid),
}

fn database(error: sqlx::Error) -> CoreError {
    CoreError::Other(error.into())
}

fn total(value: i64) -> Result<u64> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value <= MAX_AGENT_COST_TOTAL)
        .ok_or_else(|| CoreError::Other(anyhow::anyhow!("run total outside wire range")))
}

impl Db {
    pub async fn agent_cost(&self, user_id: &str, target: CostTarget) -> Result<AgentCost> {
        let (task_id, project_id) = match target {
            CostTarget::Task(id) => (Some(id), None),
            CostTarget::Project(id) => (None, Some(id)),
        };
        let mut transaction = self.pool.begin().await.map_err(database)?;
        sqlx::query!("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *transaction)
            .await
            .map_err(database)?;
        let scope = sqlx::query!(
            r#"
            WITH target AS (
                SELECT workspace_id, project_id FROM tasks WHERE id = $1
                UNION ALL
                SELECT workspace_id, id AS project_id FROM projects WHERE id = $2
            )
            SELECT target.workspace_id AS "workspace_id!", target.project_id AS "project_id?",
                   members.id AS "member_id?", members.role::text AS "role?"
            FROM target
            LEFT JOIN workspaces
                ON workspaces.id = target.workspace_id AND workspaces.archived_at IS NULL
            LEFT JOIN members
                ON members.workspace_id = workspaces.id AND members.user_id = $3
                AND members.kind = 'person'
            "#,
            task_id,
            project_id,
            user_id,
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(database)?
        .ok_or(CoreError::NotFound)?;
        let role = match scope.role.as_deref() {
            Some("admin") => Role::Admin,
            Some("member") => Role::Member,
            Some("guest") => Role::Guest,
            _ => return Err(CoreError::Forbidden),
        };
        let workspace_id = scope.workspace_id.to_string();
        let actor = Actor {
            id: scope.member_id.ok_or(CoreError::Forbidden)?.to_string(),
            workspace_id: workspace_id.clone(),
            user_id: Some(user_id.into()),
            role,
            ..Actor::default()
        };
        let resource = Resource {
            workspace_id: Some(workspace_id),
            ..Resource::default()
        };
        let action = if scope.project_id.is_some() {
            Action::FinanceRead
        } else {
            Action::WorkspaceManage
        };
        if !can(Some(&actor), action, &resource) {
            return Err(CoreError::Forbidden);
        }
        let totals = sqlx::query!(
            r#"
            SELECT coalesce(sum(runs.cost_micros), 0)::bigint AS "cost_micros!",
                   count(*) AS "runs!",
                   count(*) FILTER (WHERE runs.status = 'failed') AS "failed_runs!",
                   coalesce(sum(runs.cost_micros) FILTER (WHERE runs.status = 'failed'), 0)::bigint AS "failed_cost_micros!",
                   coalesce(sum(runs.duration_ms), 0)::bigint AS "duration_ms!"
            FROM runs
            JOIN tasks ON tasks.id = runs.task_id AND tasks.workspace_id = runs.workspace_id
            WHERE runs.workspace_id = $1
              AND (tasks.id = $2 OR tasks.project_id = $3)
            "#,
            scope.workspace_id,
            task_id,
            project_id,
        )
        .fetch_one(&mut *transaction)
        .await
        .map_err(database)?;
        transaction.commit().await.map_err(database)?;
        Ok(AgentCost {
            cost_micros: total(totals.cost_micros)?,
            runs: total(totals.runs)?,
            failed_runs: total(totals.failed_runs)?,
            failed_cost_micros: total(totals.failed_cost_micros)?,
            duration_ms: total(totals.duration_ms)?,
        })
    }
}
