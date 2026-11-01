use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Offset, TimeZone, Timelike, Utc};

use crate::error::{CoreError, Result};

/// A wall-clock (civil) datetime: a naive year/month/day hour:minute:second
/// whose fields are the *local* calendar values in a time zone, mirroring how
/// `calendarCivilTime` in `packages/schemas` returns a `Date` whose UTC fields
/// hold local calendar fields (never an actual instant).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CivilDateTime {
    pub year: i32,
    /// 1-based month.
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
    pub millisecond: u32,
}

impl CivilDateTime {
    fn to_naive(self) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(self.year, self.month, self.day)
            .expect("valid civil date")
            .and_hms_milli_opt(self.hour, self.minute, self.second, self.millisecond)
            .expect("valid civil time")
    }
}

/// `instant` → local wall clock in `zone`. Mirrors `calendarCivilTime`.
pub fn civil_datetime(instant: &DateTime<Utc>, zone: &chrono_tz::Tz) -> CivilDateTime {
    let local = instant.with_timezone(zone);
    CivilDateTime {
        year: local.year(),
        month: local.month(),
        day: local.day(),
        hour: local.hour(),
        minute: local.minute(),
        second: local.second(),
        millisecond: local.timestamp_subsec_millis(),
    }
}

/// Offset in seconds (local minus UTC, positive east), matching the sign the
/// JS `calendarWallToInstant` samples (`civilTime(sample) - sample` in ms).
fn offset_at(zone: &chrono_tz::Tz, instant: &DateTime<Utc>) -> i64 {
    zone.offset_from_utc_datetime(&instant.naive_utc())
        .fix()
        .local_minus_utc() as i64
}

/// `wall` (local) → UTC instant, with RFC 5545 / JS `calendarWallToInstant`
/// semantics: the first instant in a fold, and the offset before the transition
/// in a gap.
pub fn wall_to_instant(wall: CivilDateTime, zone: &chrono_tz::Tz) -> Result<DateTime<Utc>> {
    let naive = wall.to_naive();
    // Offset samples around the wall date (±2 days), like the JS implementation,
    // so both fold candidates and gap-adjacent offsets are captured.
    let wall_utc = naive.and_utc();
    let mut offsets: Vec<i64> = Vec::new();
    for days in [-2, -1, 0, 1, 2] {
        let sample = wall_utc + chrono::Duration::days(days);
        let off = offset_at(zone, &sample);
        if !offsets.contains(&off) {
            offsets.push(off);
        }
    }

    // Candidate UTC instants = wall (as UTC) minus each offset (seconds).
    let wall_ms = wall_utc.timestamp_millis();
    let mut candidates: Vec<(DateTime<Utc>, i64)> = offsets
        .iter()
        .map(|off| {
            let ms = wall_ms - off * 1000;
            let dt = DateTime::<Utc>::from_timestamp_millis(ms).expect("valid instant");
            let civil_ms = civil_datetime(&dt, zone)
                .to_naive()
                .and_utc()
                .timestamp_millis();
            (dt, civil_ms - wall_ms)
        })
        .collect();

    // Exact matches: civil time equals the requested wall. Sort ascending and
    // pick the first (the earlier UTC instant = the first fold).
    let mut exact: Vec<DateTime<Utc>> = candidates
        .iter()
        .filter(|(_, delta)| *delta == 0)
        .map(|(dt, _)| *dt)
        .collect();
    exact.sort();
    if let Some(first) = exact.first() {
        return Ok(*first);
    }

    // Gap: no exact match. Pick the candidate whose civil time is the smallest
    // positive distance *after* the wall (the offset before the transition).
    candidates.retain(|(_, delta)| *delta > 0);
    candidates.sort_by_key(|(_, delta)| *delta);
    candidates
        .first()
        .map(|(dt, _)| *dt)
        .ok_or(CoreError::InvalidInput)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn wall(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> CivilDateTime {
        CivilDateTime {
            year: y,
            month: mo,
            day: d,
            hour: h,
            minute: mi,
            second: s,
            millisecond: 0,
        }
    }

    #[test]
    fn wall_to_instant_matches_node_fold_and_half_hour() {
        // calendarWallToInstant("2026-11-01T01:30", "America/New_York")
        let ny: chrono_tz::Tz = "America/New_York".parse().unwrap();
        let got = wall_to_instant(wall(2026, 11, 1, 1, 30, 0), &ny).unwrap();
        assert_eq!(
            got.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "2026-11-01T05:30:00.000Z"
        );

        // calendarWallToInstant("2026-10-04T02:15", "Australia/Lord_Howe")
        let lh: chrono_tz::Tz = "Australia/Lord_Howe".parse().unwrap();
        let got = wall_to_instant(wall(2026, 10, 4, 2, 15, 0), &lh).unwrap();
        assert_eq!(
            got.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "2026-10-03T15:45:00.000Z"
        );

        // calendarWallToInstant("2026-10-09T09:00", "Asia/Kathmandu")
        let kt: chrono_tz::Tz = "Asia/Kathmandu".parse().unwrap();
        let got = wall_to_instant(wall(2026, 10, 9, 9, 0, 0), &kt).unwrap();
        assert_eq!(
            got.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "2026-10-09T03:15:00.000Z"
        );
    }

    #[test]
    fn civil_datetime_roundtrips() {
        let utc: chrono_tz::Tz = "UTC".parse().unwrap();
        let instant = Utc.with_ymd_and_hms(2026, 10, 9, 9, 0, 0).unwrap();
        let civil = civil_datetime(&instant, &utc);
        assert_eq!(civil.year, 2026);
        assert_eq!(civil.month, 10);
        assert_eq!(civil.day, 9);
        assert_eq!(civil.hour, 9);
    }
}
