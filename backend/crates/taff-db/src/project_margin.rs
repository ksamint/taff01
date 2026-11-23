use crate::{
    Db,
    costs::cost_workspace,
    project_actual::{actual_costs, finance_total},
    write::database_error,
};
use taff_contract::{ActualCurrency, ProjectMargin};
use taff_domain::{CoreError, Result};
use uuid::Uuid;

fn margin(
    currency: Option<String>,
    paid_micros: i64,
    by_currency: Vec<ActualCurrency>,
) -> Result<ProjectMargin> {
    let paid_micros = finance_total(paid_micros)?;
    // Legacy payments may predate a configured project currency.
    if paid_micros > 0 && currency.is_none() {
        return Err(CoreError::CurrencyMismatch);
    }
    let mut costs = by_currency.into_iter().filter(|row| row.total_micros > 0);
    let actual = costs.next();
    if costs.next().is_some() {
        return Err(CoreError::CurrencyMismatch);
    }
    let (currency, actual_micros) = match actual {
        Some(actual) => {
            if currency
                .as_ref()
                .is_some_and(|currency| *currency != actual.currency)
            {
                return Err(CoreError::CurrencyMismatch);
            }
            (currency.or(Some(actual.currency)), actual.total_micros)
        }
        None => (currency, 0),
    };
    // The difference of two nonnegative safe wire integers is a safe signed integer.
    Ok(ProjectMargin {
        currency,
        paid_micros,
        actual_micros,
        margin_micros: paid_micros - actual_micros,
    })
}

impl Db {
    pub async fn project_margin(&self, user_id: &str, project_id: Uuid) -> Result<ProjectMargin> {
        let mut tx = self.read_snapshot().await?;
        let workspace_id = cost_workspace(&mut tx, user_id, None, Some(project_id)).await?;
        let (by_currency, unrated_minutes) =
            actual_costs(&mut tx, workspace_id, project_id).await?;
        if unrated_minutes > 0 {
            return Err(CoreError::CostIncomplete);
        }
        let payments = sqlx::query!(
            r#"
            SELECT projects.currency, coalesce((
                SELECT sum(amount) * 1000000
                FROM project_payments
                WHERE project_payments.workspace_id = projects.workspace_id
                  AND project_payments.project_id = projects.id
            ), 0)::bigint AS "paid_micros!"
            FROM projects
            WHERE projects.workspace_id = $1 AND projects.id = $2
            "#,
            workspace_id,
            project_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(database_error)?;
        let margin = margin(payments.currency, payments.paid_micros, by_currency)?;
        tx.commit().await.map_err(database_error)?;
        Ok(margin)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use taff_contract::MAX_PROJECT_FINANCE_TOTAL;

    fn cost(currency: &str, value: i64) -> ActualCurrency {
        ActualCurrency {
            currency: currency.to_owned(),
            agent_micros: 0,
            time_micros: value,
            total_micros: value,
        }
    }

    #[test]
    fn margin_ignores_zero_currency_rows_and_bounds_signed_result() {
        let result = margin(
            None,
            0,
            vec![cost("GBP", 0), cost("USD", MAX_PROJECT_FINANCE_TOTAL)],
        )
        .unwrap();
        assert_eq!(result.currency.as_deref(), Some("USD"));
        assert_eq!(result.margin_micros, -MAX_PROJECT_FINANCE_TOTAL);
        let empty = margin(None, 0, vec![cost("GBP", 0)]).unwrap();
        assert_eq!(empty.currency, None);
        assert_eq!(empty.margin_micros, 0);
        let established = margin(Some("USD".into()), MAX_PROJECT_FINANCE_TOTAL, vec![]).unwrap();
        assert_eq!(established.margin_micros, MAX_PROJECT_FINANCE_TOTAL);
        assert!(matches!(
            margin(Some("USD".into()), MAX_PROJECT_FINANCE_TOTAL + 1, vec![]),
            Err(CoreError::Other(_))
        ));
    }

    #[test]
    fn margin_rejects_multiple_currencies_and_unlabeled_payments() {
        for result in [
            margin(None, 0, vec![cost("EUR", 2), cost("USD", 1)]),
            margin(Some("CNY".into()), 0, vec![cost("USD", 1)]),
            margin(None, 10, vec![cost("USD", 1)]),
        ] {
            assert!(matches!(result, Err(CoreError::CurrencyMismatch)));
        }
    }
}
