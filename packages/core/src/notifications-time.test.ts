import { describe, expect, it } from "vitest";
import {
  digestInstantForDay,
  digestLocalDate,
  nextDigestInstant,
} from "./notifications-time";

describe("local daily digest timing", () => {
  it("preserves saved09 across DST rather than adding24elapsed hours", () => {
    const spring = nextDigestInstant(
      new Date("2026-03-07T14:00:00Z"),
      "09:00",
      "America/New_York",
    );
    expect(spring.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(
      nextDigestInstant(
        new Date("2026-10-31T13:00:00Z"),
        "09:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z");
  });
  it("uses fixed offsets with Intl sign and has exact wall-time due boundary", () => {
    expect(digestLocalDate(new Date("2026-10-08T16:00:00Z"), "+0800")).toBe(
      "2026-10-09",
    );
    expect(
      nextDigestInstant(
        new Date("2026-10-09T00:59:59.999Z"),
        "09:00",
        "+08:00",
      ).toISOString(),
    ).toBe("2026-10-09T01:00:00.000Z");
    expect(
      nextDigestInstant(
        new Date("2026-10-09T01:00:00Z"),
        "09:00",
        "+08:00",
      ).toISOString(),
    ).toBe("2026-10-10T01:00:00.000Z");
  });
  it("handles Havana missing midnight and an entire skipped civil day", () => {
    expect(
      digestInstantForDay(
        "2026-03-08",
        "09:00",
        "America/Havana",
      ).toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
    expect(
      nextDigestInstant(
        new Date("2011-12-29T19:00:00Z"),
        "09:00",
        "Pacific/Apia",
      ).toISOString(),
    ).toBe("2011-12-30T19:00:00.000Z");
    expect(
      digestLocalDate(new Date("2011-12-30T19:00:00Z"), "Pacific/Apia"),
    ).toBe("2011-12-31");
  });
});
