export function deadlineFields(iso: string | null, timeZone: string) {
  if (!iso) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const time = `${get("hour")}:${get("minute")}`;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: time === "23:59" ? "" : time,
  };
}
// Native date/time inputs are wall-clock values in the user's saved IANA zone.
// An omitted time means an end-of-day deadline, never a calendar duration.
export function deadlineIso(
  date: string,
  time: string,
  timeZone: string,
): string | null {
  if (!date) return null;
  const local = `${date}T${time || "23:59"}:00`;
  const wall = Date.parse(`${local}Z`);
  if (!Number.isFinite(wall)) throw new Error("invalid_date");
  let instant = wall;
  for (let pass = 0; pass < 4; pass++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    const displayed = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    const next = wall - (displayed - instant);
    if (next === instant) break;
    instant = next;
  }
  const fields = deadlineFields(new Date(instant).toISOString(), timeZone);
  if (fields.date !== date || (fields.time || "23:59") !== (time || "23:59"))
    throw new Error("invalid_date");
  return new Date(instant + (time ? 0 : 59999)).toISOString();
}
