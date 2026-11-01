// One-shot generator for the Rust parity golden file. Run with:
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/rust-recurrence-golden.mts
// It emits the canonical RRule for the UTC cases the Rust `calendar` module
// ports, so `cargo test` can assert byte-for-byte parity without Node present.
import { normalizeCalendarSchedule } from "../packages/core/src/calendar-recurrence";
import { calendarWallToInstant } from "../packages/schemas/src/calendar";

const cases: { name: string; start: string; rrule: string }[] = [
  {
    name: "weekly_reorder",
    start: "2026-10-09T09:00",
    rrule: "byday=FR,MO;freq=weekly;interval=2;wkst=MO",
  },
  {
    name: "monthly_last_day",
    start: "2026-01-31T09:00",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
  },
  {
    name: "daily_until",
    start: "2026-10-09T09:00",
    rrule: "FREQ=DAILY;UNTIL=20261010T090000Z",
  },
  {
    name: "yearly_leap",
    start: "2024-02-29T09:00",
    rrule: "FREQ=YEARLY;COUNT=2",
  },
  {
    name: "daily_interval",
    start: "2026-10-09T09:00",
    rrule: "FREQ=DAILY;INTERVAL=2;COUNT=5",
  },
];

const out: Record<string, string | null> = {};
for (const c of cases) {
  const startAt = calendarWallToInstant(c.start, "UTC");
  try {
    const normalized = normalizeCalendarSchedule({
      startAt,
      endAt: new Date(Date.parse(startAt) + 3600000).toISOString(),
      timeZone: "UTC",
      rrule: c.rrule,
    });
    out[c.name] = normalized.rrule;
  } catch {
    out[c.name] = null;
  }
}

// Rejections: record that each is rejected (null), not the message.
const rejects = [
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
];
out.rejections = rejects.map((r) => {
  try {
    const startAt = calendarWallToInstant("2026-10-09T09:00", "UTC");
    normalizeCalendarSchedule({
      startAt,
      endAt: new Date(Date.parse(startAt) + 3600000).toISOString(),
      timeZone: "UTC",
      rrule: r,
    });
    return `${r} -> ACCEPTED (unexpected)`;
  } catch {
    return `${r} -> rejected`;
  }
});

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
