use crate::MAX_PROJECT_FINANCE_TOTAL;
use schemars::{JsonSchema, r#gen::SchemaGenerator, schema::Schema};
use serde::{Deserialize, Serialize};

const MIN_PROJECT_MARGIN_TOTAL: i64 = -MAX_PROJECT_FINANCE_TOTAL;

#[derive(Debug, Deserialize, JsonSchema, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectMargin {
    #[serde(deserialize_with = "Deserialize::deserialize")]
    #[schemars(schema_with = "nullable_currency", regex(pattern = "^[A-Z]{3}$"))]
    pub currency: Option<String>,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub paid_micros: i64,
    #[schemars(range(min = 0, max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub actual_micros: i64,
    #[schemars(range(min = "MIN_PROJECT_MARGIN_TOTAL", max = "MAX_PROJECT_FINANCE_TOTAL"))]
    pub margin_micros: i64,
}

fn nullable_currency(generator: &mut SchemaGenerator) -> Schema {
    generator.subschema_for::<Option<String>>()
}
