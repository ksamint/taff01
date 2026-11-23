use serde::Deserialize;
use serde_json::Value;
use taff_domain::plan_model::{PlanInput, build_plan_model};

#[derive(Deserialize)]
struct Fixture {
    name: String,
    input: PlanInput,
    expected: Value,
}

#[test]
fn plan_model_matches_node_forecasts_and_wire_data() {
    let fixtures: Vec<Fixture> =
        serde_json::from_str(include_str!("fixtures/plan-model-golden.json"))
            .expect("Node plan-model fixtures");
    for fixture in fixtures {
        assert_eq!(
            build_plan_model(&fixture.input),
            fixture.expected,
            "{}",
            fixture.name
        );
    }
}
