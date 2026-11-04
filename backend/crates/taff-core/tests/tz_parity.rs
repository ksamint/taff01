//! Parity for `wall_to_instant` / `civil_datetime` against
//! `calendarWallToInstant` / `calendarCivilTime` in `packages/schemas`.
//! The fixture is written by `scripts/rust-tz-golden.mts`
//! (`pnpm rust:fixtures`): fold, gap, half-hour, quarter-hour, fixed-offset
//! and alias zones.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use taff_core::{CivilDateTime, Zone};

#[derive(Deserialize)]
struct Wall {
    name: String,
    wall: String,
    zone: String,
    instant: DateTime<Utc>,
    civil: CivilDateTime,
}

#[derive(Deserialize)]
struct Instant {
    name: String,
    instant: DateTime<Utc>,
    zone: String,
    civil: CivilDateTime,
}

#[derive(Deserialize)]
struct Golden {
    walls: Vec<Wall>,
    instants: Vec<Instant>,
    #[serde(rename = "invalidZones")]
    invalid_zones: Vec<String>,
}

/// `YYYY-MM-DDTHH:MM[:SS[.mmm]]`, the local ISO form `calendarWallToInstant` takes.
fn parse_wall(wall: &str) -> CivilDateTime {
    let (date, time) = wall.split_once('T').expect("wall has a date and a time");
    let mut d = date.split('-').map(|p| p.parse::<u32>().unwrap());
    let mut t = time.split(':');
    let (year, month, day) = (
        d.next().unwrap() as i32,
        d.next().unwrap(),
        d.next().unwrap(),
    );
    let hour = t.next().unwrap().parse().unwrap();
    let minute = t.next().unwrap().parse().unwrap();
    let (second, millisecond) = match t.next() {
        None => (0, 0),
        Some(s) => {
            let (sec, frac) = s.split_once('.').unwrap_or((s, "0"));
            (sec.parse().unwrap(), format!("{frac:0<3}").parse().unwrap())
        }
    };
    CivilDateTime {
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
    }
}

#[test]
fn wall_to_instant_matches_node() {
    let golden: Golden = serde_json::from_str(include_str!("fixtures/tz-golden.json")).unwrap();
    assert!(golden.walls.len() >= 17, "wall cases went missing");
    for case in &golden.walls {
        let zone: Zone = case
            .zone
            .parse()
            .unwrap_or_else(|e| panic!("{}: {e}", case.name));
        let got = zone
            .instant(parse_wall(&case.wall))
            .unwrap_or_else(|e| panic!("{}: {e}", case.name));
        assert_eq!(got, case.instant, "instant mismatch for {}", case.name);
        assert_eq!(
            zone.civil(&got),
            case.civil,
            "civil mismatch for {}",
            case.name
        );
    }
}

#[test]
fn civil_datetime_matches_node() {
    let golden: Golden = serde_json::from_str(include_str!("fixtures/tz-golden.json")).unwrap();
    for case in &golden.instants {
        let zone: Zone = case.zone.parse().unwrap();
        assert_eq!(
            zone.civil(&case.instant),
            case.civil,
            "mismatch for {}",
            case.name
        );
    }
    for zone in &golden.invalid_zones {
        assert!(zone.parse::<Zone>().is_err(), "{zone} must be rejected");
    }
}
