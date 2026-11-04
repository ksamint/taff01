// Golden fixture for the Rust timezone port (`wall_to_instant`,
// `civil_datetime`): fold, gap, half-hour, quarter-hour, fixed-offset and
// alias zones, produced by `calendarWallToInstant` / `calendarCivilTime` in
// packages/schemas. Part of `pnpm rust:fixtures`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  calendarCivilTime,
  calendarWallToInstant,
} from "../packages/schemas/src/calendar";

const walls: { name: string; wall: string; zone: string }[] = [
  {
    name: "newyork_fold_first_instant",
    wall: "2026-11-01T01:30",
    zone: "America/New_York",
  },
  {
    name: "newyork_gap_offset_before",
    wall: "2026-03-08T02:30",
    zone: "America/New_York",
  },
  {
    name: "newyork_plain",
    wall: "2026-07-04T12:00:30.250",
    zone: "America/New_York",
  },
  {
    name: "lord_howe_gap",
    wall: "2026-10-04T02:15",
    zone: "Australia/Lord_Howe",
  },
  {
    name: "lord_howe_fold",
    wall: "2026-04-05T01:45",
    zone: "Australia/Lord_Howe",
  },
  {
    name: "kathmandu_quarter_hour",
    wall: "2026-10-09T09:00",
    zone: "Asia/Kathmandu",
  },
  { name: "kolkata_half_hour", wall: "2026-10-09T09:00", zone: "Asia/Kolkata" },
  { name: "calcutta_alias", wall: "2026-10-09T09:00", zone: "Asia/Calcutta" },
  { name: "shanghai", wall: "2026-10-09T09:00", zone: "Asia/Shanghai" },
  { name: "hong_kong", wall: "2026-10-09T09:00", zone: "Asia/Hong_Kong" },
  { name: "fixed_plus_0800", wall: "2026-10-09T09:00", zone: "+08:00" },
  { name: "fixed_plus_0800_compact", wall: "2026-10-09T09:00", zone: "+0800" },
  { name: "fixed_plus_08", wall: "2026-10-09T09:00", zone: "+08" },
  { name: "fixed_minus_0330", wall: "2026-10-09T09:00", zone: "-03:30" },
  { name: "utc", wall: "2026-10-09T09:00", zone: "UTC" },
  { name: "london_fold", wall: "2026-10-25T01:30", zone: "Europe/London" },
  {
    name: "sao_paulo_no_dst",
    wall: "2026-11-01T00:00",
    zone: "America/Sao_Paulo",
  },
];

const civil = walls.map((w) => {
  const instant = calendarWallToInstant(w.wall, w.zone);
  const c = calendarCivilTime(instant, w.zone);
  return {
    ...w,
    instant,
    // Local calendar fields, read back from the instant (never an instant itself).
    civil: {
      year: c.getUTCFullYear(),
      month: c.getUTCMonth() + 1,
      day: c.getUTCDate(),
      hour: c.getUTCHours(),
      minute: c.getUTCMinutes(),
      second: c.getUTCSeconds(),
      millisecond: c.getUTCMilliseconds(),
    },
  };
});

// Instants converted to the zone's wall clock, one per fold side.
const instants = [
  {
    name: "newyork_fold_edt",
    instant: "2026-11-01T05:30:00.000Z",
    zone: "America/New_York",
  },
  {
    name: "newyork_fold_est",
    instant: "2026-11-01T06:30:00.000Z",
    zone: "America/New_York",
  },
  {
    name: "lord_howe_after_gap",
    instant: "2026-10-03T15:45:00.000Z",
    zone: "Australia/Lord_Howe",
  },
  {
    name: "fixed_minus_0330",
    instant: "2026-10-09T12:30:00.000Z",
    zone: "-03:30",
  },
].map((i) => {
  const c = calendarCivilTime(i.instant, i.zone);
  return {
    ...i,
    civil: {
      year: c.getUTCFullYear(),
      month: c.getUTCMonth() + 1,
      day: c.getUTCDate(),
      hour: c.getUTCHours(),
      minute: c.getUTCMinutes(),
      second: c.getUTCSeconds(),
      millisecond: c.getUTCMilliseconds(),
    },
  };
});

const invalid = ["Mars/Olympus", "+25:00", "08:00", "+8"].filter((zone) => {
  try {
    calendarWallToInstant("2026-10-09T09:00", zone);
    return false;
  } catch {
    return true;
  }
});

const target = fileURLToPath(
  new URL(
    "../backend/crates/taff-core/tests/fixtures/tz-golden.json",
    import.meta.url,
  ),
);
writeFileSync(
  target,
  `${JSON.stringify({ walls: civil, instants, invalidZones: invalid }, null, 2)}\n`,
);
console.log(
  `${civil.length} walls, ${instants.length} instants, ${invalid.length} invalid zones -> ${target}`,
);
