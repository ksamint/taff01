use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectHealth {
    OnTrack,
    AtRisk,
    OffTrack,
}

impl ProjectHealth {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OnTrack => "on_track",
            Self::AtRisk => "at_risk",
            Self::OffTrack => "off_track",
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectHealthInput {
    pub project_id: Uuid,
    pub health: ProjectHealth,
    #[schemars(length(max = 2000))]
    pub body: String,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectHealthUpdate {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub author_id: Uuid,
    pub health: ProjectHealth,
    #[schemars(length(max = 2000))]
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectHealthPage {
    pub updates: Vec<ProjectHealthUpdate>,
    pub next_cursor: Option<Uuid>,
}
