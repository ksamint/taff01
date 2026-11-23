use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskCriterion {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub task_id: Uuid,
    #[schemars(range(min = 0))]
    pub position: i32,
    #[schemars(length(min = 1, max = 300))]
    pub text: String,
    pub checked_by: Option<Uuid>,
    pub checked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskCriterionInput {
    pub task_id: Uuid,
    #[schemars(length(min = 1, max = 300))]
    pub text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TaskCriterionEdit {
    #[schemars(length(min = 1, max = 300))]
    pub text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskCriteriaReorder {
    pub task_id: Uuid,
    pub ids: Vec<Uuid>,
}
