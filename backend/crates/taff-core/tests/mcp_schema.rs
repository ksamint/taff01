//! Verifies the MCP tool argument schemas — generated from the Zod source by
//! `apps/api/scripts/mcp-schema-gen.mts` — are consumed and enforced by Rust.
//! This proves the single-source-of-truth bridge in ADR 0026: the web/API
//! canonicalizes Zod to JSON Schema, and Rust validates the same shapes.

use serde_json::Value;

fn tool_schemas() -> Value {
    let raw = include_str!("fixtures/mcp-tools.json");
    serde_json::from_str(raw).expect("mcp-tools.json must be valid JSON")
}

/// Number of tools the API registers (`MCP_TOOLS` in mcp-round-trip.ts).
const EXPECTED_TOOLS: usize = 34;

#[test]
fn every_mcp_tool_has_a_schema() {
    let tools = tool_schemas();
    let map = tools
        .as_object()
        .expect("must be an object keyed by tool name");
    assert_eq!(map.len(), EXPECTED_TOOLS, "tool schema count drifted");
    for (name, schema) in map {
        assert!(schema.is_object(), "{name} schema must be an object");
        assert_eq!(
            schema["type"], "object",
            "{name} input schema must be an object (JSON Schema)"
        );
    }
}

#[test]
fn rust_validates_mcp_tool_arguments() {
    let tools = tool_schemas();

    // tasks.create requires title and ownerId; workspaceId is optional.
    let create_schema = &tools["tasks.create"];
    let valid: Value = serde_json::json!({
        "title": "Ship the Rust backend",
        "ownerId": "1ff2ddc1-4de0-4b4a-9438-0f1e0d0b7319",
    });
    assert!(
        jsonschema::is_valid(create_schema, &valid),
        "a minimal tasks.create argument must validate"
    );

    // Missing required title/ownerId must be rejected by the same schema.
    let invalid: Value = serde_json::json!({ "workspaceId": "nope-not-a-uuid" });
    assert!(
        !jsonschema::is_valid(create_schema, &invalid),
        "an invalid tasks.create argument must be rejected"
    );
}

#[test]
fn uuid_and_enums_are_enforced() {
    let tools = tool_schemas();

    // tasks.list has a `status` enum and `additionalProperties: false`.
    let list_schema = &tools["tasks.list"];
    let valid: Value = serde_json::json!({ "status": "todo" });
    assert!(jsonschema::is_valid(list_schema, &valid));

    // A status outside the enum must be rejected.
    let bad_status: Value = serde_json::json!({ "status": "not-a-real-status" });
    assert!(!jsonschema::is_valid(list_schema, &bad_status));

    // Unknown keys are rejected (additionalProperties: false).
    let stray: Value = serde_json::json!({ "nonexistentField": 1 });
    assert!(!jsonschema::is_valid(list_schema, &stray));
}
