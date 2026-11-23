use crate::{
    Db, MutationActor,
    costs::{agent_totals, cost_workspace},
    project_health::require_project,
    write::database_error,
};
use sqlx::PgConnection;
use std::collections::BTreeMap;
use taff_contract::{ActualCurrency, MAX_PROJECT_FINANCE_TOTAL, ProjectActual, ProjectBudget};
use taff_domain::{Action, CoreError, Result};
use uuid::Uuid;

fn finance_total(value: i64) -> Result<i64> {
    if (0..=MAX_PROJECT_FINANCE_TOTAL).contains(&value) {
        Ok(value)
    } else {
        Err(CoreError::Other(anyhow::anyhow!(
            "project finance total outside wire range"
        )))
    }
}

pub(crate) async fn actual_costs(
    connection: &mut PgConnection,
    workspace_id: Uuid,
    project_id: Uuid,
) -> Result<(Vec<ActualCurrency>, i64)> {
    let agent = agent_totals(connection, workspace_id, None, Some(project_id)).await?;
    let agent_micros = finance_total(agent.cost_micros)?;

    // Divide only after summing integer micro-minutes exactly. Adding half an
    // hour before integer division rounds a tie up to the next whole micro.
    let time = sqlx::query!(
        r#"
        SELECT rate.currency AS "currency?",
               coalesce(div(sum(entries.minutes::numeric * rate.rate_micros_per_hour) + 30, 60), 0)::bigint AS "time_micros!",
               sum(entries.minutes)::bigint AS "minutes!"
        FROM time_entries AS entries
        JOIN tasks ON tasks.id = entries.task_id AND tasks.workspace_id = entries.workspace_id
        LEFT JOIN LATERAL (
            SELECT currency, rate_micros_per_hour
            FROM member_rates
            WHERE workspace_id = entries.workspace_id AND person_id = entries.person_id
              AND valid_from <= entries.day
            ORDER BY valid_from DESC
            LIMIT 1
        ) AS rate ON true
        WHERE entries.workspace_id = $1 AND tasks.project_id = $2
        GROUP BY rate.currency
        "#,
        workspace_id,
        project_id,
    )
    .fetch_all(connection)
    .await
    .map_err(database_error)?;

    let mut unrated_minutes = 0;
    let mut by_currency = BTreeMap::new();
    for row in time {
        if let Some(currency) = row.currency {
            let time_micros = finance_total(row.time_micros)?;
            by_currency.insert(
                currency.clone(),
                ActualCurrency {
                    currency,
                    agent_micros: 0,
                    time_micros,
                    total_micros: time_micros,
                },
            );
        } else {
            unrated_minutes = finance_total(row.minutes)?;
        }
    }
    if agent_micros > 0 {
        let usd = by_currency
            .entry("USD".to_owned())
            .or_insert(ActualCurrency {
                currency: "USD".to_owned(),
                agent_micros: 0,
                time_micros: 0,
                total_micros: 0,
            });
        usd.agent_micros = agent_micros;
        usd.total_micros = finance_total(agent_micros + usd.time_micros)?;
    }
    Ok((by_currency.into_values().collect(), unrated_minutes))
}

impl Db {
    pub async fn project_actual(&self, user_id: &str, project_id: Uuid) -> Result<ProjectActual> {
        let mut tx = self.cost_snapshot().await?;
        let workspace_id = cost_workspace(&mut tx, user_id, None, Some(project_id)).await?;
        let budget = sqlx::query_as!(
            ProjectBudget,
            "SELECT amount_micros, currency FROM project_budgets WHERE workspace_id = $1 AND project_id = $2",
            workspace_id,
            project_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(database_error)?;
        let (by_currency, unrated_minutes) =
            actual_costs(&mut tx, workspace_id, project_id).await?;
        tx.commit().await.map_err(database_error)?;
        Ok(ProjectActual {
            budget,
            by_currency,
            unrated_minutes,
        })
    }

    pub async fn set_project_budget(
        &self,
        user_id: &str,
        project_id: Uuid,
        input: ProjectBudget,
    ) -> Result<ProjectBudget> {
        if !(0..=MAX_PROJECT_FINANCE_TOTAL).contains(&input.amount_micros)
            || input.currency.len() != 3
            || !input.currency.bytes().all(|byte| byte.is_ascii_uppercase())
        {
            return Err(CoreError::InvalidInput);
        }
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let (workspace_id, _) = require_project(tx, user_id, project_id, Action::FinanceManage).await?;
            let budget = sqlx::query_as!(
                ProjectBudget,
                "INSERT INTO project_budgets (workspace_id, project_id, amount_micros, currency)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (project_id) DO UPDATE SET amount_micros = EXCLUDED.amount_micros, currency = EXCLUDED.currency
                 RETURNING amount_micros, currency",
                workspace_id,
                project_id,
                input.amount_micros,
                input.currency,
            )
            .fetch_one(tx)
            .await?;
            Ok(budget)
        })
        .await
    }
}
