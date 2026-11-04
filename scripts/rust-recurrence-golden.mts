// Golden fixture for the Rust `normalize_rrule` port. Part of
// `pnpm rust:fixtures`; CI regenerates and diffs the output. Every case
// records the start instant, zone and raw rule so the Rust test is fully
// table-driven; `accepted` holds the canonical rule, `rejected` holds rules
// `normalizeCalendarSchedule` refuses with `invalid_input`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeCalendarSchedule } from "../packages/core/src/calendar-recurrence";
import { calendarWallToInstant } from "../packages/schemas/src/calendar";

type Case = { name: string; wall: string; zone: string; rrule: string };

// Wall clock + zone pairs chosen so the civil anchor differs from the UTC
// date or weekday: the port must derive BYDAY/BYMONTH/BYMONTHDAY anchors in
// the schedule's zone, not in UTC.
const cases: Case[] = [
  {
    name: "weekly_reorder",
    wall: "2026-10-09T09:00",
    zone: "UTC",
    rrule: "byday=FR,MO;freq=weekly;interval=2;wkst=MO",
  },
  {
    name: "monthly_last_day",
    wall: "2026-01-31T09:00",
    zone: "UTC",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
  },
  {
    name: "daily_until",
    wall: "2026-10-09T09:00",
    zone: "UTC",
    rrule: "FREQ=DAILY;UNTIL=20261010T090000Z",
  },
  {
    name: "yearly_leap",
    wall: "2024-02-29T09:00",
    zone: "UTC",
    rrule: "FREQ=YEARLY;COUNT=2",
  },
  {
    name: "daily_interval",
    wall: "2026-10-09T09:00",
    zone: "UTC",
    rrule: "FREQ=DAILY;INTERVAL=2;COUNT=5",
  },
  {
    name: "prefix_lowercase",
    wall: "2026-10-09T09:00",
    zone: "UTC",
    rrule: "rrule:freq=daily",
  },
  {
    name: "until_equals_start",
    wall: "2026-10-09T09:00",
    zone: "UTC",
    rrule: "FREQ=DAILY;UNTIL=20261009T090000Z",
  },
  {
    name: "weekly_newyork_evening",
    wall: "2026-10-09T22:30",
    zone: "America/New_York",
    rrule: "FREQ=WEEKLY;BYDAY=FR",
  },
  {
    name: "weekly_tokyo_after_midnight",
    wall: "2026-10-10T00:30",
    zone: "Asia/Tokyo",
    rrule: "FREQ=WEEKLY;BYDAY=SA",
  },
  {
    name: "monthly_first_tokyo",
    wall: "2026-02-01T00:30",
    zone: "Asia/Tokyo",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  },
  {
    name: "yearly_fixed_offset",
    wall: "2027-01-01T00:15",
    zone: "+08:00",
    rrule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1",
  },
  {
    name: "fixed_offset_compact",
    wall: "2026-10-10T00:30",
    zone: "+0800",
    rrule: "FREQ=WEEKLY;BYDAY=SA",
  },
  {
    name: "alias_zone",
    wall: "2026-10-09T09:00",
    zone: "Asia/Calcutta",
    rrule: "FREQ=DAILY",
  },
  {
    name: "lord_howe_gap_anchor",
    wall: "2026-10-04T02:15",
    zone: "Australia/Lord_Howe",
    rrule: "FREQ=WEEKLY;BYDAY=SU",
  },
];

const rejected: Case[] = [
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
  "FREQ=DAILY;UNTIL=20261009T085959Z",
  "RRULE:RRULE:FREQ=DAILY",
  "FREQ=DAILY;INTERVAL=+2",
  "FREQ=DAILY;INTERVAL=",
].map((rrule, index) => ({
  name: `reject_${index}`,
  wall: "2026-10-09T09:00",
  zone: "UTC",
  rrule,
}));
rejected.push(
  // Valid in UTC (Friday), invalid in the schedule's zone (Saturday).
  {
    name: "reject_byday_wrong_zone",
    wall: "2026-10-10T00:30",
    zone: "Asia/Tokyo",
    rrule: "FREQ=WEEKLY;BYDAY=FR",
  },
  {
    name: "reject_bymonthday_wrong_zone",
    wall: "2026-02-01T00:30",
    zone: "Asia/Tokyo",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=31",
  },
  {
    name: "reject_unknown_zone",
    wall: "2026-10-09T09:00",
    zone: "Mars/Olympus",
    rrule: "FREQ=DAILY",
  },
);

function normalize(c: Case): string | null {
  let startAt: string;
  try {
    startAt = calendarWallToInstant(c.wall, c.zone);
  } catch {
    return null;
  }
  try {
    return normalizeCalendarSchedule({
      startAt,
      endAt: new Date(Date.parse(startAt) + 3600000).toISOString(),
      timeZone: c.zone,
      rrule: c.rrule,
    }).rrule;
  } catch {
    return null;
  }
}

const accepted = cases.map((c) => {
  const canonical = normalize(c);
  if (canonical === null) throw new Error(`${c.name}: unexpectedly rejected`);
  return { ...c, startAt: calendarWallToInstant(c.wall, c.zone), canonical };
});
const refused = rejected.map((c) => {
  if (normalize(c) !== null)
    throw new Error(`${c.name}: unexpectedly accepted`);
  let startAt: string | null = null;
  try {
    startAt = calendarWallToInstant(c.wall, c.zone);
  } catch {
    startAt = null;
  }
  return { ...c, startAt };
});

const target = fileURLToPath(
  new URL(
    "../backend/crates/taff-core/tests/fixtures/recurrence-golden.json",
    import.meta.url,
  ),
);
writeFileSync(
  target,
  `${JSON.stringify({ accepted, rejected: refused }, null, 2)}\n`,
);
console.log(
  `${accepted.length} accepted, ${refused.length} rejected -> ${target}`,
);
