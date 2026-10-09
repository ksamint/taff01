import {
  calendarCivilTime,
  calendarWallToInstant,
  canonicalCalendarTimeZone,
} from "@taff/schemas";
export function digestLocalDate(instant: Date, zone: string): string {
  return calendarCivilTime(instant, zone).toISOString().slice(0, 10);
}
export function digestInstantForDay(
  day: string,
  time: string,
  zone: string,
): Date {
  return new Date(
    calendarWallToInstant(`${day}T${time}`, canonicalCalendarTimeZone(zone)),
  );
}
/** Next future wall-clock slot, skipping lost civil days and never adding elapsed24h. */
export function nextDigestInstant(now: Date, time: string, zone: string): Date {
  const civil = calendarCivilTime(now, zone);
  for (let i = 0; i < 7; i++) {
    const day = civil.toISOString().slice(0, 10);
    const candidate = digestInstantForDay(day, time, zone);
    if (candidate.getTime() > now.getTime()) return candidate;
    civil.setUTCDate(civil.getUTCDate() + 1);
  }
  throw new RangeError("Cannot resolve next digest time");
}
