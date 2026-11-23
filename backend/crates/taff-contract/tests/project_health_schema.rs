use schemars::schema_for;
use serde_json::{Value, json};
use taff_contract::{ProjectHealthInput, ProjectHealthPage, ProjectHealthUpdate};

#[test]
fn generated_health_schemas_are_current() {
    let committed: Value = serde_json::from_str(include_str!(
        "../../../../packages/schemas/generated/project-health.json"
    ))
    .unwrap();
    assert_eq!(
        committed,
        json!({
            "input": schema_for!(ProjectHealthInput),
            "page": schema_for!(ProjectHealthPage),
            "update": schema_for!(ProjectHealthUpdate),
        })
    );
}
