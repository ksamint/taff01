use std::str::FromStr;

use chrono::{
    DateTime, Datelike, FixedOffset, NaiveDate, NaiveDateTime, Offset, TimeZone, Timelike, Utc,
};

use crate::error::{CoreError, Result};

/// A wall-clock (civil) datetime: a naive year/month/day hour:minute:second
/// whose fields are the *local* calendar values in a time zone, mirroring how
/// `calendarCivilTime` in `packages/schemas` returns a `Date` whose UTC fields
/// hold local calendar fields (never an actual instant).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
    fn to_naive(self) -> Option<NaiveDateTime> {
        NaiveDate::from_ymd_opt(self.year, self.month, self.day)?.and_hms_milli_opt(
            self.hour,
            self.minute,
            self.second,
            self.millisecond,
        )
    }
}

/// A schedule time zone as `canonicalCalendarTimeZone` accepts it: an IANA
/// name (link names such as `Asia/Calcutta` included) or a fixed offset
/// written `±HH`, `±HHMM` or `±HH:MM`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    Named(chrono_tz::Tz),
    Fixed(FixedOffset),
}

impl Zone {
    /// `instant` → local wall clock in this zone. Mirrors `calendarCivilTime`.
    pub fn civil(&self, instant: &DateTime<Utc>) -> CivilDateTime {
        match self {
            Zone::Named(tz) => civil_datetime(instant, tz),
            Zone::Fixed(offset) => civil_datetime(instant, offset),
        }
    }

    /// `wall` (local) → UTC instant. Mirrors `calendarWallToInstant`.
    pub fn instant(&self, wall: CivilDateTime) -> Result<DateTime<Utc>> {
        match self {
            Zone::Named(tz) => wall_to_instant(wall, tz),
            Zone::Fixed(offset) => wall_to_instant(wall, offset),
        }
    }
}

impl FromStr for Zone {
    type Err = CoreError;

    fn from_str(zone: &str) -> Result<Self> {
        if let Some(offset) = parse_fixed_offset(zone) {
            return Ok(Zone::Fixed(offset));
        }
        zone.parse::<chrono_tz::Tz>()
            .map(Zone::Named)
            .map_err(|_| CoreError::InvalidInput)
    }
}

/// `^([+-])(\d{2})(?::?(\d{2}))?$` as in `canonicalCalendarTimeZone`, bounded
/// to the offsets `Intl.DateTimeFormat` accepts (hours ≤ 23, minutes ≤ 59).
fn parse_fixed_offset(zone: &str) -> Option<FixedOffset> {
    let b = zone.as_bytes();
    let sign = match b.first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let two_digits = |s: &[u8]| -> Option<i32> {
        if s.len() == 2 && s.iter().all(u8::is_ascii_digit) {
            Some(((s[0] - b'0') as i32) * 10 + (s[1] - b'0') as i32)
        } else {
            None
        }
    };
    let (hours, minutes) = match b.len() {
        3 => (two_digits(&b[1..3])?, 0),
        5 => (two_digits(&b[1..3])?, two_digits(&b[3..5])?),
        6 if b[3] == b':' => (two_digits(&b[1..3])?, two_digits(&b[4..6])?),
        _ => return None,
    };
    if hours > 23 || minutes > 59 {
        return None;
    }
    FixedOffset::east_opt(sign * (hours * 3600 + minutes * 60))
}

/// `instant` → local wall clock in `zone`. Mirrors `calendarCivilTime`.
pub fn civil_datetime<Z: TimeZone>(instant: &DateTime<Utc>, zone: &Z) -> CivilDateTime {
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
fn offset_at<Z: TimeZone>(zone: &Z, instant: &DateTime<Utc>) -> i64 {
    zone.offset_from_utc_datetime(&instant.naive_utc())
        .fix()
        .local_minus_utc() as i64
}

/// `wall` (local) → UTC instant, with RFC 5545 / JS `calendarWallToInstant`
/// semantics: the first instant in a fold, and the offset before the transition
/// in a gap. An impossible calendar value (31 February) is `invalid_input`.
pub fn wall_to_instant<Z: TimeZone>(wall: CivilDateTime, zone: &Z) -> Result<DateTime<Utc>> {
    let naive = wall.to_naive().ok_or(CoreError::InvalidInput)?;
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
                .expect("civil time of a valid instant")
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

    #[test]
    fn parses_fixed_offsets_like_canonical_calendar_time_zone() {
        for (zone, seconds) in [
            ("+08:00", 28_800),
            ("+0800", 28_800),
            ("+08", 28_800),
            ("-03:30", -12_600),
        ] {
            assert_eq!(
                zone.parse::<Zone>().unwrap(),
                Zone::Fixed(FixedOffset::east_opt(seconds).unwrap()),
                "{zone}"
            );
        }
        for bad in ["08:00", "+8", "+25:00", "+08:60", "Mars/Olympus", ""] {
            assert!(bad.parse::<Zone>().is_err(), "{bad} must be rejected");
        }
        assert!(matches!(
            "Asia/Calcutta".parse::<Zone>(),
            Ok(Zone::Named(_))
        ));
    }

    #[test]
    fn impossible_wall_time_is_invalid_input() {
        let utc: Zone = "UTC".parse().unwrap();
        let wall = CivilDateTime {
            year: 2026,
            month: 2,
            day: 31,
            hour: 9,
            minute: 0,
            second: 0,
            millisecond: 0,
        };
        assert!(matches!(utc.instant(wall), Err(CoreError::InvalidInput)));
    }
}
