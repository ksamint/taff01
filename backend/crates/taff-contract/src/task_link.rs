use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskLinkKind {
    Related,
    Duplicate,
}

impl TaskLinkKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Related => "related",
            Self::Duplicate => "duplicate",
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskLinkInput {
    pub from_task_id: Uuid,
    pub to_task_id: Uuid,
    pub kind: TaskLinkKind,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskLink {
    pub id: Uuid,
    pub kind: TaskLinkKind,
    pub from_task_id: Uuid,
    pub to_task_id: Uuid,
    pub other_task_id: Uuid,
    pub other_task_title: String,
}
