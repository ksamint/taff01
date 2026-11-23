use crate::{Db, write::database_error};
use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use serde_json::{Value, json};
use sqlx::PgConnection;
use taff_domain::{
    Action, Actor, CoreError, Resource, Result, Role, TaskStatus, Zone, can,
    plan_model::{
        EndKind, PlanDependency, PlanEnd, PlanFinance, PlanInput, PlanMilestone, PlanTask,
        TaskPlan, build_plan_model,
    },
};
use uuid::Uuid;

struct ProjectScope {
    workspace_id: Uuid,
    contract_amount: Option<String>,
    currency: Option<String>,
    actor: Actor,
    resource: Resource,
}

async fn project_scope(
    connection: &mut PgConnection,
    user_id: &str,
    project_id: Uuid,
    action: Action,
) -> Result<ProjectScope> {
    let row = sqlx::query!(
        r#"
        SELECT projects.workspace_id, projects.contract_amount::text AS "contract_amount?",
               projects.currency, members.id AS "member_id?", members.role::text AS "role?"
        FROM projects
        LEFT JOIN workspaces ON workspaces.id = projects.workspace_id AND workspaces.archived_at IS NULL
        LEFT JOIN members ON members.workspace_id = workspaces.id
                         AND members.user_id = $2 AND members.kind = 'person'
        WHERE projects.id = $1
        "#,
        project_id,
        user_id,
    )
    .fetch_optional(connection)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)?;
    let role = match row.role.as_deref() {
        Some("admin") => Role::Admin,
        Some("member") => Role::Member,
        Some("guest") => Role::Guest,
        _ => return Err(CoreError::Forbidden),
    };
    let workspace = row.workspace_id.to_string();
    let actor = Actor {
        id: row.member_id.ok_or(CoreError::Forbidden)?.to_string(),
        workspace_id: workspace.clone(),
        user_id: Some(user_id.to_owned()),
        role,
        ..Actor::default()
    };
    let resource = Resource {
        workspace_id: Some(workspace),
        ..Resource::default()
    };
    if !can(Some(&actor), action, &resource) {
        return Err(CoreError::Forbidden);
    }
    Ok(ProjectScope {
        workspace_id: row.workspace_id,
        contract_amount: row.contract_amount,
        currency: row.currency,
        actor,
        resource,
    })
}

struct MilestoneRow {
    id: Uuid,
    name: String,
    date: NaiveDate,
    version: i32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

async fn milestones(
    connection: &mut PgConnection,
    workspace_id: Uuid,
    project_id: Uuid,
) -> Result<Vec<MilestoneRow>> {
    sqlx::query_as!(
        MilestoneRow,
        "SELECT id, name, date, version, created_at, updated_at
         FROM milestones
         WHERE workspace_id = $1 AND project_id = $2 AND archived_at IS NULL
         ORDER BY date, id",
        workspace_id,
        project_id,
    )
    .fetch_all(connection)
    .await
    .map_err(database_error)
}

fn model_status(status: &str) -> Result<TaskStatus> {
    match status {
        "todo" => Ok(TaskStatus::Todo),
        "in_progress" => Ok(TaskStatus::InProgress),
        "needs_review" => Ok(TaskStatus::NeedsReview),
        "done" => Ok(TaskStatus::Done),
        _ => Err(CoreError::Other(anyhow::anyhow!("invalid task status"))),
    }
}

fn profile_zone(time_zone: &str) -> Result<Zone> {
    // Intl accepts named time zones case-insensitively and profile settings
    // preserve their original spelling.
    time_zone
        .parse()
        .or_else(|_| {
            chrono_tz::TZ_VARIANTS
                .iter()
                .find(|zone| zone.name().eq_ignore_ascii_case(time_zone))
                .copied()
                .map(Zone::Named)
                .ok_or(())
        })
        .map_err(|_| CoreError::Other(anyhow::anyhow!("invalid profile time zone")))
}

fn civil_day(zone: Zone, instant: DateTime<Utc>) -> Result<NaiveDate> {
    let date = zone.civil(&instant);
    NaiveDate::from_ymd_opt(date.year, date.month, date.day)
        .ok_or_else(|| CoreError::Other(anyhow::anyhow!("invalid timeline civil date")))
}

fn iso(instant: DateTime<Utc>) -> String {
    instant.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn end(task_id: Option<Uuid>, milestone_id: Option<Uuid>) -> Result<PlanEnd> {
    match (task_id, milestone_id) {
        (Some(id), None) => Ok(PlanEnd {
            id: id.to_string(),
            kind: EndKind::Task,
        }),
        (None, Some(id)) => Ok(PlanEnd {
            id: id.to_string(),
            kind: EndKind::Milestone,
        }),
        _ => Err(CoreError::Other(anyhow::anyhow!(
            "invalid timeline dependency end"
        ))),
    }
}

impl Db {
    pub async fn project_timeline(&self, user_id: &str, project_id: Uuid) -> Result<Value> {
        let mut tx = self.read_snapshot().await?;
        let scope = project_scope(&mut tx, user_id, project_id, Action::WorkspaceRead).await?;
        let workspace_id = scope.workspace_id;
        let time_zone = sqlx::query_scalar!("SELECT tz FROM users WHERE id = $1", user_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(database_error)?
            .ok_or(CoreError::Unauthorized)?;
        let zone = profile_zone(&time_zone)?;
        let rows = sqlx::query!(
            r#"
            SELECT tasks.id, tasks.parent_id, tasks.title, tasks.status::text AS "status!",
                   tasks.priority, tasks.due_at, tasks.owner_id, tasks.worker_id, tasks.version,
                   task_plans.start_date AS "start_date?", task_plans.duration_days AS "duration_days?",
                   task_plans.version AS "plan_version?",
                   coalesce(worker.kind = 'agent', false) AS "worker_is_agent!",
                   exists (
                       SELECT 1 FROM grants
                       WHERE grants.workspace_id = tasks.workspace_id AND grants.task_id = tasks.id
                         AND grants.status = 'pending'
                   ) AS "blocked!"
            FROM tasks
            LEFT JOIN task_plans ON task_plans.id = tasks.id AND task_plans.archived_at IS NULL
            LEFT JOIN members AS worker ON worker.id = tasks.worker_id
            WHERE tasks.workspace_id = $1 AND tasks.project_id = $2 AND tasks.archived_at IS NULL
            ORDER BY tasks.number
            "#,
            workspace_id,
            project_id,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?;
        let task_ids: Vec<_> = rows.iter().map(|task| task.id).collect();
        let tasks = rows
            .into_iter()
            .map(|row| {
                let plan = row
                    .start_date
                    .zip(row.duration_days)
                    .zip(row.plan_version)
                    .map(|((start_date, duration_days), version)| TaskPlan {
                        start_date,
                        duration_days,
                        version,
                    });
                Ok(PlanTask {
                    id: row.id.to_string(),
                    parent_id: row.parent_id.map(|id| id.to_string()),
                    title: row.title,
                    status: model_status(&row.status)?,
                    priority: row.priority,
                    due_date: row
                        .due_at
                        .map(|due_at| civil_day(zone, due_at))
                        .transpose()?,
                    plan,
                    owner_id: row.owner_id.to_string(),
                    worker_id: row.worker_id.map(|id| id.to_string()),
                    worker_is_agent: row.worker_is_agent,
                    blocked: row.blocked,
                    version: row.version,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let milestone_rows = milestones(&mut tx, workspace_id, project_id).await?;
        let milestone_ids: Vec<_> = milestone_rows
            .iter()
            .map(|milestone| milestone.id)
            .collect();
        let milestones = milestone_rows
            .into_iter()
            .map(|row| PlanMilestone {
                id: row.id.to_string(),
                name: row.name,
                date: row.date,
                version: row.version,
            })
            .collect();
        let dependencies = sqlx::query!(
            "SELECT id, predecessor_task_id, predecessor_milestone_id, successor_task_id, successor_milestone_id
             FROM task_dependencies
             WHERE workspace_id = $1 AND (
                 predecessor_task_id = ANY($2::uuid[]) OR successor_task_id = ANY($2::uuid[])
                 OR predecessor_milestone_id = ANY($3::uuid[]) OR successor_milestone_id = ANY($3::uuid[])
             )
             ORDER BY created_at, id",
            workspace_id,
            &task_ids,
            &milestone_ids,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?
        .into_iter()
        .map(|row| {
            Ok(PlanDependency {
                id: row.id.to_string(),
                from: end(row.predecessor_task_id, row.predecessor_milestone_id)?,
                to: end(row.successor_task_id, row.successor_milestone_id)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
        let finance = if can(Some(&scope.actor), Action::FinanceRead, &scope.resource) {
            let collected = sqlx::query_scalar!(
                r#"SELECT coalesce(sum(amount), 0)::numeric(14,2)::text AS "total!"
                   FROM project_payments WHERE workspace_id = $1 AND project_id = $2"#,
                workspace_id,
                project_id,
            )
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
            Some(PlanFinance {
                contract_amount: scope.contract_amount,
                currency: scope.currency,
                collected,
            })
        } else {
            None
        };
        let can_edit_plan = scope.actor.role == Role::Admin
            || tasks.iter().any(|task| {
                can(
                    Some(&scope.actor),
                    Action::TaskSchedule,
                    &Resource {
                        task_id: Some(task.id.clone()),
                        owner_id: Some(task.owner_id.clone()),
                        worker_id: task.worker_id.clone(),
                        ..scope.resource.clone()
                    },
                )
            });
        tx.commit().await.map_err(database_error)?;
        let mut model = build_plan_model(&PlanInput {
            today: civil_day(zone, Utc::now())?,
            tasks,
            milestones,
            dependencies,
            finance,
        });
        model["timeZone"] = json!(time_zone);
        model["canEditPlan"] = json!(can_edit_plan);
        Ok(model)
    }

    pub async fn project_milestones(&self, user_id: &str, project_id: Uuid) -> Result<Value> {
        let mut tx = self.read_snapshot().await?;
        let scope = project_scope(&mut tx, user_id, project_id, Action::WorkspaceRead).await?;
        let rows = milestones(&mut tx, scope.workspace_id, project_id).await?;
        tx.commit().await.map_err(database_error)?;
        Ok(Value::Array(
            rows.into_iter()
                .map(|row| {
                    json!({
                        "id":row.id,
                        "workspaceId":scope.workspace_id,
                        "projectId":project_id,
                        "name":row.name,
                        "date":row.date,
                        "archivedAt":null,
                        "version":row.version,
                        "createdAt":iso(row.created_at),
                        "updatedAt":iso(row.updated_at)
                    })
                })
                .collect(),
        ))
    }

    pub async fn project_payments(&self, user_id: &str, project_id: Uuid) -> Result<Value> {
        let mut tx = self.read_snapshot().await?;
        let scope = project_scope(&mut tx, user_id, project_id, Action::FinanceRead).await?;
        let rows = sqlx::query!(
            r#"SELECT id, amount::text AS "amount!", paid_on, note, created_by, created_at
               FROM project_payments WHERE workspace_id = $1 AND project_id = $2
               ORDER BY paid_on, created_at"#,
            scope.workspace_id,
            project_id,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?;
        tx.commit().await.map_err(database_error)?;
        Ok(Value::Array(
            rows.into_iter()
                .map(|row| {
                    json!({
                        "id":row.id,
                        "workspaceId":scope.workspace_id,
                        "projectId":project_id,
                        "amount":row.amount,
                        "paidOn":row.paid_on,
                        "note":row.note,
                        "createdBy":row.created_by,
                        "createdAt":iso(row.created_at)
                    })
                })
                .collect(),
        ))
    }
}
