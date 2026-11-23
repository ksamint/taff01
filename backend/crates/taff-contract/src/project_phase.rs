use chrono::NaiveDate;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPhase {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
    #[schemars(range(min = 0))]
    pub position: i32,
    pub start: NaiveDate,
    pub end: NaiveDate,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPhaseInput {
    pub project_id: Uuid,
    /// The trimmed name contains 1 to 120 Unicode characters.
    pub name: String,
    #[serde(deserialize_with = "super::time_tracking::civil_date")]
    pub start: NaiveDate,
    #[serde(deserialize_with = "super::time_tracking::civil_date")]
    pub end: NaiveDate,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProjectPhaseEdit {
    /// The trimmed name contains 1 to 120 Unicode characters.
    pub name: String,
    #[serde(deserialize_with = "super::time_tracking::civil_date")]
    pub start: NaiveDate,
    #[serde(deserialize_with = "super::time_tracking::civil_date")]
    pub end: NaiveDate,
}
