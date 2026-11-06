use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc, Weekday};

use crate::error::{CoreError, Result};
use crate::tz::Zone;

const PARTS: [&str; 8] = [
    "FREQ",
    "INTERVAL",
    "COUNT",
    "UNTIL",
    "BYDAY",
    "BYMONTHDAY",
    "BYMONTH",
    "WKST",
];
const WEEKDAYS: [&str; 7] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/// A `Date` whose UTC fields represent local calendar fields (never an
/// actual instant), mirroring `calendarCivilTime` in `packages/schemas`.
/// Rust stores this as a `(year, month, day-of-month)` plus the time of day;
/// the recurrence canonicalizer only needs the date components.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CivilDate {
    year: i32,
    /// 1-based month.
    month: u32,
    /// day of month.
    day: u32,
}

fn civil_date(instant: &DateTime<Utc>, zone: &Zone) -> CivilDate {
    // `chrono-tz` converts a UTC instant to the wall clock in `zone`; its
    // DST transition data matches IANA/ICU for the zones we normalize.
    let local = zone.civil(instant);
    CivilDate {
        year: local.year,
        month: local.month,
        day: local.day,
    }
}

/// Weekday of a civil date (anchored day-of-week), 0 = Sunday, matching the
/// JavaScript `Date#getUTCDay()` used on the civil Date (whose UTC fields hold
/// the local calendar fields).
fn civil_weekday(d: &CivilDate) -> u32 {
    let naive = NaiveDate::from_ymd_opt(d.year, d.month, d.day)
        .expect("civil date must be a valid calendar date");
    // chrono: Monday=0..Sunday=6; JS: Sunday=0. Map accordingly.
    match naive.weekday() {
        Weekday::Mon => 1,
        Weekday::Tue => 2,
        Weekday::Wed => 3,
        Weekday::Thu => 4,
        Weekday::Fri => 5,
        Weekday::Sat => 6,
        Weekday::Sun => 0,
    }
}

/// Parses and validates a basic UTC `UNTIL` value (`YYYYMMDDTHHMMSSZ`) against
/// the same bounds as `parseUntil` in `calendar-recurrence.ts`.
fn parse_until(value: &str) -> Result<DateTime<Utc>> {
    let b = value.as_bytes();
    // YYYYMMDD T HHMMSS Z
    if b.len() != 16 || b[8] != b'T' || b[15] != b'Z' {
        return Err(CoreError::InvalidInput);
    }
    let digits = |start: usize, len: usize| -> Result<u32> {
        let mut acc = 0u32;
        for &c in &b[start..start + len] {
            if !c.is_ascii_digit() {
                return Err(CoreError::InvalidInput);
            }
            acc = acc * 10 + (c - b'0') as u32;
        }
        Ok(acc)
    };
    let year = digits(0, 4)?;
    let month = digits(4, 2)?;
    let day = digits(6, 2)?;
    let hour = digits(9, 2)?;
    let minute = digits(11, 2)?;
    let second = digits(13, 2)?;
    let dt = Utc
        .with_ymd_and_hms(year as i32, month, day, hour, minute, second)
        .single()
        .ok_or(CoreError::InvalidInput)?;
    let ms = dt.timestamp_millis();
    // Bounds in calendar-recurrence.ts: >= 1970-01-01 and < 2201-01-01.
    if ms < 0
        || ms
            >= Utc
                .with_ymd_and_hms(2201, 1, 1, 0, 0, 0)
                .unwrap()
                .timestamp_millis()
    {
        return Err(CoreError::InvalidInput);
    }
    Ok(dt)
}

/// Normalizes a raw RRule string into its canonical upper-case ordered form, or
/// rejects it with `invalid_input`. This mirrors the `ruleFor` canonicalization
/// in `packages/core/src/calendar-recurrence.ts` (lines 54–138) — the pure
/// validation/normalization that does not expand occurrences.
///
/// `start_at` is the series start instant; `zone` is its IANA time zone or a
/// fixed offset like `+08:00` (see [`Zone`]), used to derive the anchor's
/// civil date and to reject an `UNTIL` earlier than the start.
///
/// Note: the TypeScript `ruleFor` performs an additional `RRule.parseString`
/// round-trip on the canonical string to populate per-frequency defaults used
/// only by occurrence *expansion*. That step is not needed to produce the
/// canonical string returned by `normalizeCalendarSchedule`, so it is deferred
/// to the expansion port; any difference it could make to acceptance is covered
/// by the parity test.
pub fn normalize_rrule(raw: &str, start_at: &DateTime<Utc>, zone: &str) -> Result<String> {
    let zone: Zone = zone.parse()?;
    let anchor = civil_date(start_at, &zone);
    if raw.contains(['\r', '\n']) {
        return Err(CoreError::InvalidInput);
    }
    // `.trim().replace(/^RRULE:/i, "").toUpperCase()`: one prefix, any case.
    let upper = raw.trim().to_uppercase();
    let body = upper.strip_prefix("RRULE:").unwrap_or(&upper);

    let mut values: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    for part in body.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let mut kv = part.split('=');
        let key = kv.next().unwrap_or("");
        let value = kv.next();
        let extra = kv.next();
        if !PARTS.contains(&key)
            || value.is_none()
            || value.unwrap().is_empty()
            || extra.is_some()
            || values.contains_key(key)
        {
            return Err(CoreError::InvalidInput);
        }
        values.insert(key.to_string(), value.unwrap().to_string());
    }

    let freq = values.get("FREQ").cloned().ok_or(CoreError::InvalidInput)?;
    if !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].contains(&freq.as_str()) {
        return Err(CoreError::InvalidInput);
    }

    // integer(value, min, max); None when absent, rejects out-of-range.
    fn integer(
        values: &mut std::collections::BTreeMap<String, String>,
        key: &str,
        min: i64,
        max: i64,
    ) -> Result<()> {
        let Some(v) = values.get(key).cloned() else {
            return Ok(());
        };
        if !v.bytes().all(|b| b.is_ascii_digit())
            && !(v.starts_with('-') && v[1..].bytes().all(|b| b.is_ascii_digit()))
        {
            return Err(CoreError::InvalidInput);
        }
        let n: i64 = v.parse().map_err(|_| CoreError::InvalidInput)?;
        if n < min || n > max {
            return Err(CoreError::InvalidInput);
        }
        values.insert(key.to_string(), n.to_string());
        Ok(())
    }
    integer(&mut values, "INTERVAL", 1, 366)?;
    integer(&mut values, "COUNT", 1, 1000)?;
    integer(&mut values, "BYMONTH", 1, 12)?;
    integer(&mut values, "BYMONTHDAY", -1, 31)?;

    if values.get("BYMONTHDAY").map(|v| v == "0").unwrap_or(false) {
        return Err(CoreError::InvalidInput);
    }
    if values.contains_key("COUNT") && values.contains_key("UNTIL") {
        return Err(CoreError::InvalidInput);
    }
    if values.contains_key("BYMONTH") && freq.as_str() != "YEARLY" {
        return Err(CoreError::InvalidInput);
    }
    if values.contains_key("BYMONTHDAY") && freq.as_str() != "MONTHLY" && freq.as_str() != "YEARLY"
    {
        return Err(CoreError::InvalidInput);
    }
    if let Some(wkst) = values.get("WKST")
        && (freq.as_str() != "WEEKLY" || !WEEKDAYS.contains(&wkst.as_str()))
    {
        return Err(CoreError::InvalidInput);
    }
    if let Some(byday) = values.get("BYDAY") {
        if freq.as_str() != "WEEKLY" {
            return Err(CoreError::InvalidInput);
        }
        let days: Vec<&str> = byday.split(',').collect();
        let mut seen = std::collections::HashSet::new();
        if days.len() > 7
            || days.iter().any(|d| !WEEKDAYS.contains(d))
            || !days.iter().all(|d| seen.insert(*d))
            || !days.contains(&WEEKDAYS[civil_weekday(&anchor) as usize])
        {
            return Err(CoreError::InvalidInput);
        }
        // Sort by (index+6)%7, matching the JS comparator.
        let mut sorted = days.clone();
        sorted.sort_by_key(|d| (WEEKDAYS.iter().position(|w| w == d).unwrap() as isize + 6) % 7);
        values.insert("BYDAY".to_string(), sorted.join(","));
    }
    if let Some(bymonth) = values.get("BYMONTH")
        && bymonth
            .parse::<u32>()
            .map(|m| m != anchor.month)
            .unwrap_or(true)
    {
        return Err(CoreError::InvalidInput);
    }
    if let Some(bymonthday) = values.get("BYMONTHDAY") {
        let expected: i64 = bymonthday.parse().map_err(|_| CoreError::InvalidInput)?;
        // last day of the anchor's month (leap-year aware), matching the JS
        // `new Date(Date.UTC(y, m+1, 0)).getUTCDate()`.
        let next_month = if anchor.month == 12 {
            (anchor.year + 1, 1)
        } else {
            (anchor.year, anchor.month + 1)
        };
        let last_day = NaiveDate::from_ymd_opt(next_month.0, next_month.1, 1)
            .expect("valid date")
            .pred_opt()
            .expect("valid date")
            .day() as i64;
        let matches = if expected == -1 {
            anchor.day as i64 == last_day
        } else {
            anchor.day as i64 == expected
        };
        if !matches {
            return Err(CoreError::InvalidInput);
        }
    }

    // An UNTIL must parse and must not precede the series start
    // (`until.getTime() < actualStart.getTime()` is rejected in `ruleFor`).
    if let Some(until) = values.get("UNTIL")
        && parse_until(until)? < *start_at
    {
        return Err(CoreError::InvalidInput);
    }

    let mut parts = Vec::new();
    for k in PARTS {
        if let Some(v) = values.get(k) {
            parts.push(format!("{k}={v}"));
        }
    }
    Ok(parts.join(";"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap()
    }

    #[test]
    fn canonicalizes_case_and_order() {
        // Mirrors: byday=FR,MO;freq=weekly;interval=2;wkst=MO on 2026-10-09
        // (anchor weekday is Friday), UTC.
        let out = normalize_rrule(
            "byday=FR,MO;freq=weekly;interval=2;wkst=MO",
            &utc(2026, 10, 9, 9, 0, 0),
            "UTC",
        )
        .unwrap();
        assert_eq!(out, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=MO");
    }

    #[test]
    fn canonicalizes_last_day_of_month() {
        // FREQ=MONTHLY;BYMONTHDAY=-1 anchored on the last day (2026-01-31).
        let out = normalize_rrule(
            "FREQ=MONTHLY;BYMONTHDAY=-1",
            &utc(2026, 1, 31, 9, 0, 0),
            "UTC",
        )
        .unwrap();
        assert_eq!(out, "FREQ=MONTHLY;BYMONTHDAY=-1");
    }

    #[test]
    fn canonicalizes_valid_until() {
        let out = normalize_rrule(
            "FREQ=DAILY;UNTIL=20261010T090000Z",
            &utc(2026, 10, 9, 9, 0, 0),
            "UTC",
        )
        .unwrap();
        assert_eq!(out, "FREQ=DAILY;UNTIL=20261010T090000Z");
    }

    #[test]
    fn strips_one_prefix_of_any_case_and_accepts_fixed_offsets() {
        let start = utc(2026, 10, 9, 9, 0, 0);
        assert_eq!(
            normalize_rrule("rrule:freq=daily", &start, "UTC").unwrap(),
            "FREQ=DAILY"
        );
        assert_eq!(
            normalize_rrule("FREQ=DAILY", &start, "+08:00").unwrap(),
            "FREQ=DAILY"
        );
        assert!(normalize_rrule("FREQ=DAILY", &start, "Mars/Olympus").is_err());
    }

    #[test]
    fn rejects_adversarial_rules() {
        for bad in [
            "FREQ=SECONDLY",
            "FREQ=HOURLY",
            "FREQ=DAILY;INTERVAL=0",
            "FREQ=DAILY;COUNT=1001",
            "FREQ=DAILY;COUNT=2;UNTIL=20261010T090000Z",
            "FREQ=DAILY;BYDAY=MO",
            "FREQ=WEEKLY;BYDAY=1FR",
            "FREQ=MONTHLY;BYMONTHDAY=1,15",
            "FREQ=MONTHLY;BYMONTHDAY=0",
            "FREQ=MONTHLY;BYSETPOS=-1",
            "FREQ=DAILY;BYHOUR=9,10",
            "FREQ=WEEKLY;WKST=BAD",
            "FREQ=DAILY\nDTSTART=20261009T090000Z",
            "FREQ=DAILY;FREQ=WEEKLY",
            "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30",
            "FREQ=WEEKLY;BYDAY=MO",
            "FREQ=DAILY;UNTIL=20260230T090000Z",
            "FREQ=DAILY;UNTIL=20200101T000000Z",
            "RRULE:RRULE:FREQ=DAILY",
        ] {
            assert!(
                normalize_rrule(bad, &utc(2026, 10, 9, 9, 0, 0), "UTC").is_err(),
                "expected rejection for {bad}"
            );
        }
    }
}
