use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const MAX_PROJECT_FINANCE_TOTAL: i64 = (1 << 53) - 1;

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBudget {
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub amount_micros: i64,
    #[schemars(regex(pattern = "^[A-Z]{3}$"))]
    pub currency: String,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActualCurrency {
    #[schemars(regex(pattern = "^[A-Z]{3}$"))]
    pub currency: String,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub agent_micros: i64,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub time_micros: i64,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub total_micros: i64,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectActual {
    pub budget: Option<ProjectBudget>,
    pub by_currency: Vec<ActualCurrency>,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub unrated_minutes: i64,
}
