//! Wire types generated from the committed TypeScript JSON Schema contracts.
//!
//! Validate inputs with the original schema before deserializing. For PATCH
//! fields where omission and null have different meanings, keep the raw JSON
//! until the caller applies the field-level update.
// Typify can emit unused defaults and other lintable code as part of its output.
#[allow(dead_code, clippy::all)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/contracts.rs"));
}

pub use generated::{mcp, render, rest};

pub const MAX_AGENT_COST_TOTAL: u64 = (1 << 53) - 1;

/// Summed costs in USD micro-units for all runs in the requested scope.
#[derive(Debug, PartialEq, serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentCost {
    #[schemars(range(max = "MAX_AGENT_COST_TOTAL"))]
    pub cost_micros: u64,
    #[schemars(range(max = "MAX_AGENT_COST_TOTAL"))]
    pub runs: u64,
    #[schemars(range(max = "MAX_AGENT_COST_TOTAL"))]
    pub failed_runs: u64,
    #[schemars(range(max = "MAX_AGENT_COST_TOTAL"))]
    pub failed_cost_micros: u64,
    #[schemars(range(max = "MAX_AGENT_COST_TOTAL"))]
    pub duration_ms: u64,
}
mod project_health;
pub use project_health::{
    ProjectHealth, ProjectHealthInput, ProjectHealthPage, ProjectHealthUpdate,
};
mod task_link;
pub use task_link::{TaskLink, TaskLinkInput, TaskLinkKind};
mod task_criteria;
pub use task_criteria::{
    TaskCriteriaReorder, TaskCriterion, TaskCriterionEdit, TaskCriterionInput,
};
mod time_tracking;
pub use time_tracking::{
    MAX_RATE_MICROS_PER_HOUR, MemberRate, MemberRateInput, TimeEntries, TimeEntry, TimeEntryEdit,
    TimeEntryInput,
};
mod project_actual;
pub use project_actual::{ActualCurrency, MAX_PROJECT_FINANCE_TOTAL, ProjectActual, ProjectBudget};
mod project_margin;
pub use project_margin::ProjectMargin;
mod project_phase;
pub use project_phase::{ProjectPhase, ProjectPhaseEdit, ProjectPhaseInput};
