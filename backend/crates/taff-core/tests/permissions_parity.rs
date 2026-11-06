//! Source arguments and decisions are generated together by TypeScript, without a second Rust case table.
use serde::Deserialize;
use taff_core::{Action, Actor, Resource, Scope, can_at, can_grant_oauth_scopes};
#[derive(Deserialize)]
struct Case {
    name: String,
    now: i64,
    actor: Option<Actor>,
    action: Option<Action>,
    #[serde(rename = "oauthScopes")]
    oauth_scopes: Option<Vec<Scope>>,
    resource: Resource,
    result: bool,
}
#[test]
fn permissions_match_typescript_source_cases() {
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("fixtures/permissions-golden.json")).unwrap();
    assert!(cases.len() > 400);
    let failures: Vec<_> = cases
        .into_iter()
        .filter_map(|case| {
            let actual = if let Some(scopes) = case.oauth_scopes {
                can_grant_oauth_scopes(case.actor.as_ref(), &case.resource, &scopes)
            } else {
                can_at(
                    case.actor.as_ref(),
                    case.action.expect("can case has action"),
                    &case.resource,
                    case.now,
                )
            };
            (actual != case.result)
                .then(|| format!("{}: Rust={actual}, Node={}", case.name, case.result))
        })
        .collect();
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
