use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{fs, path::Path};
use taff_contract::{AgentCost, mcp, render, rest};
use taff_domain::canonical_json;

fn round_trip<T: Serialize + DeserializeOwned>(source: Value, name: &str) {
    let expected = canonical_json(&source);
    let typed: T = serde_json::from_value(source)
        .unwrap_or_else(|error| panic!("could not deserialize {name}: {error}"));
    let actual = canonical_json(&serde_json::to_value(typed).unwrap());
    assert_eq!(actual, expected, "{name}");
}

#[test]
fn generated_renderer_fixtures_round_trip() {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../taff-render/tests/fixtures");
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let name = path.file_name().unwrap().to_str().unwrap();
        let input: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        match name.split('-').next().unwrap() {
            "calendar" => round_trip::<render::calendar_image::RequestBody>(input, name),
            "graph" => round_trip::<render::graph_image::RequestBody>(input, name),
            "summary" => round_trip::<render::daily_summary::RequestBody>(input, name),
            "timeline" => round_trip::<render::timeline_image::RequestBody>(input, name),
            _ => panic!("missing type for fixture {name}"),
        };
    }
}

#[test]
fn rest_and_mcp_types_round_trip() {
    round_trip::<rest::get_api_health::Response200>(json!({"status": "ok"}), "health");
    round_trip::<rest::post_api_auth_sign_out::RequestBody>(json!({}), "sign-out");
    round_trip::<mcp::timeline_get::Arguments>(
        json!({"projectId": "00000000-0000-4000-8000-000000000001"}),
        "timeline.get",
    );
}

#[test]
fn agent_cost_schema_matches_the_web_contract() {
    let shared: Value = serde_json::from_str(include_str!(
        "../../../../packages/schemas/generated/agent-cost.json"
    ))
    .unwrap();
    assert_eq!(
        serde_json::to_value(schemars::schema_for!(AgentCost)).unwrap(),
        shared
    );
}
