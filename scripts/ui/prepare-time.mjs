// Native Temporal reads the system clock independently of Playwright's Date clock.
export function prepareTime() {
  if (typeof Temporal === "undefined") return;
  const instant = Temporal.Instant.from("2026-10-08T11:20:00Z");
  const timeZoneId = Temporal.Now.timeZoneId;
  Temporal.Now.instant = () => instant;
  Temporal.Now.zonedDateTimeISO = (zone = timeZoneId()) =>
    instant.toZonedDateTimeISO(zone);
  if (Temporal.Now.instant().epochMilliseconds !== 1791458400000)
    throw new Error("Capture clock did not freeze Temporal");
}
