//! Byte parity for `canonical_json` against `canonicalJson` in
//! `packages/core/src/trusted-review.ts`. The fixture is written by
//! `scripts/rust-canonical-json-golden.mts` (`pnpm rust:fixtures`), including
//! JavaScript number formatting, string escaping and key ordering.

use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Case {
    name: String,
    input: Value,
    output: String,
}

#[test]
fn canonical_json_matches_node_bytes() {
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("fixtures/canonical-json-golden.json"))
            .expect("golden fixture must be valid JSON");
    assert!(cases.len() >= 12, "cases went missing");
    for case in &cases {
        assert_eq!(
            taff_core::canonical_json(&case.input),
            case.output,
            "mismatch for {}",
            case.name
        );
    }
}
