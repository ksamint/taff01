use chrono::{DateTime, Datelike, NaiveDate, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize, de::Error};
use uuid::Uuid;

pub const MAX_RATE_MICROS_PER_HOUR: i64 = (1 << 53) - 1;

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeEntry {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub task_id: Uuid,
    pub person_id: Uuid,
    #[schemars(range(min = 1, max = 1440))]
    pub minutes: i32,
    pub day: NaiveDate,
    #[schemars(length(max = 2000))]
    pub note: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeEntries {
    pub time_zone: String,
    pub today: NaiveDate,
    pub entries: Vec<TimeEntry>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeEntryInput {
    pub task_id: Uuid,
    #[schemars(range(min = 1, max = 1440))]
    pub minutes: i32,
    #[serde(deserialize_with = "civil_date")]
    pub day: NaiveDate,
    #[schemars(length(max = 2000))]
    pub note: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TimeEntryEdit {
    #[schemars(range(min = 1, max = 1440))]
    pub minutes: i32,
    #[serde(deserialize_with = "civil_date")]
    pub day: NaiveDate,
    #[schemars(length(max = 2000))]
    pub note: String,
}

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemberRate {
    pub workspace_id: Uuid,
    pub person_id: Uuid,
    #[schemars(range(min = 0, max = "MAX_RATE_MICROS_PER_HOUR"))]
    pub rate_micros_per_hour: i64,
    #[schemars(regex(pattern = "^[A-Z]{3}$"))]
    pub currency: String,
    pub valid_from: NaiveDate,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemberRateInput {
    pub workspace_id: Uuid,
    pub person_id: Uuid,
    #[schemars(range(min = 0, max = "MAX_RATE_MICROS_PER_HOUR"))]
    pub rate_micros_per_hour: i64,
    #[schemars(regex(pattern = "^[A-Z]{3}$"))]
    pub currency: String,
    #[serde(deserialize_with = "civil_date")]
    pub valid_from: NaiveDate,
}

fn civil_date<'de, D: Deserializer<'de>>(deserializer: D) -> Result<NaiveDate, D::Error> {
    let text = String::deserialize(deserializer)?;
    let date = text.parse::<NaiveDate>().map_err(D::Error::custom)?;
    if date.year() < 1 || text.len() != 10 || date.to_string() != text {
        return Err(D::Error::custom("expected YYYY-MM-DD"));
    }
    Ok(date)
}
