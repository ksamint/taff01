//! Parity test against the TypeScript `normalizeCalendarSchedule` output.
//!
//! `fixtures/recurrence-golden.json` is written by
//! `scripts/rust-recurrence-golden.mts` (`pnpm rust:fixtures`) from
//! `packages/core/src/calendar-recurrence.ts`; the local gate regenerates it and fails on
//! a diff. Every case carries its start instant, zone and raw rule, so nothing
//! here is hand-copied.

use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Deserialize)]
struct Accepted {
    name: String,
    #[serde(rename = "startAt")]
    start_at: DateTime<Utc>,
    zone: String,
    rrule: String,
    canonical: String,
}

#[derive(Deserialize)]
struct Rejected {
    name: String,
    /// `None` when the zone itself is invalid and no instant exists.
    #[serde(rename = "startAt")]
    start_at: Option<DateTime<Utc>>,
    zone: String,
    rrule: String,
}

#[derive(Deserialize)]
struct Golden {
    accepted: Vec<Accepted>,
    rejected: Vec<Rejected>,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("fixtures/recurrence-golden.json"))
        .expect("golden fixture must match the generator's shape")
}

#[test]
fn canonicalization_matches_node_golden() {
    let golden = golden();
    assert!(golden.accepted.len() >= 14, "accepted cases went missing");
    for case in &golden.accepted {
        let got = taff_core::normalize_rrule(&case.rrule, &case.start_at, &case.zone)
            .unwrap_or_else(|e| panic!("{} unexpectedly rejected: {e}", case.name));
        assert_eq!(got, case.canonical, "mismatch for {}", case.name);
    }
}

#[test]
fn rejections_match_node_golden() {
    let golden = golden();
    assert!(golden.rejected.len() >= 20, "rejected cases went missing");
    for case in &golden.rejected {
        let start = case.start_at.unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
        let result = taff_core::normalize_rrule(&case.rrule, &start, &case.zone);
        assert!(
            matches!(result, Err(taff_core::CoreError::InvalidInput)),
            "{} must be rejected with invalid_input, got {result:?}",
            case.name
        );
    }
}
