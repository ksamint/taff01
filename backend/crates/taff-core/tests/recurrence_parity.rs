//! Parity test against the TypeScript `normalizeCalendarSchedule` output.
//!
//! The golden values in `fixtures/recurrence-golden.json` were generated from
//! `packages/core/src/calendar-recurrence.ts` by
//! `scripts/rust-recurrence-golden.mts`. This test re-reads them so the Rust
//! canonicalizer is pinned to the Node behavior, not to hand-copied literals.

use chrono::{TimeZone, Utc};
use std::collections::HashMap;

fn golden() -> HashMap<String, String> {
    let raw = include_str!("fixtures/recurrence-golden.json");
    serde_json::from_str(raw).expect("golden fixture must be valid JSON")
}

fn start_cases() -> HashMap<&'static str, (i32, u32, u32, u32, u32, u32)> {
    HashMap::from([
        ("weekly_reorder", (2026, 10, 9, 9, 0, 0)),
        ("monthly_last_day", (2026, 1, 31, 9, 0, 0)),
        ("daily_until", (2026, 10, 9, 9, 0, 0)),
        ("yearly_leap", (2024, 2, 29, 9, 0, 0)),
        ("daily_interval", (2026, 10, 9, 9, 0, 0)),
    ])
}

fn raw_rrule(name: &str) -> &'static str {
    match name {
        "weekly_reorder" => "byday=FR,MO;freq=weekly;interval=2;wkst=MO",
        "monthly_last_day" => "FREQ=MONTHLY;BYMONTHDAY=-1",
        "daily_until" => "FREQ=DAILY;UNTIL=20261010T090000Z",
        "yearly_leap" => "FREQ=YEARLY;COUNT=2",
        "daily_interval" => "FREQ=DAILY;INTERVAL=2;COUNT=5",
        _ => unreachable!("unknown golden case"),
    }
}

#[test]
fn canonicalization_matches_node_golden() {
    let golden = golden();
    for (name, (y, mo, d, h, mi, s)) in start_cases() {
        let start = Utc.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap();
        let expected = golden
            .get(name)
            .unwrap_or_else(|| panic!("missing golden value for {name}"));
        let got = taff_core::normalize_rrule(raw_rrule(name), &start, "UTC")
            .unwrap_or_else(|e| panic!("{name} unexpectedly rejected: {e}"));
        assert_eq!(&got, expected, "mismatch for {name}");
    }
}
