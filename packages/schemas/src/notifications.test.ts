import { describe, expect, it } from "vitest";
import {
  changeEventSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
  digestJobSchema,
  notificationPreferencesSchema,
  shouldShowForegroundNotification,
} from "./index";

describe("notification settings trust and delivery policy", () => {
  it("has exact prototype defaults and strict version/time bodies", () => {
    expect(
      notificationPreferencesSchema.parse(DEFAULT_NOTIFICATION_PREFERENCES),
    ).toEqual({
      version: 1,
      review: true,
      block: true,
      mention: true,
      done: true,
      digest: true,
      digestAt: "09:00",
      quiet: false,
    });
    for (const fields of [
      { version: 0 },
      { version: 1.5 },
      { digestAt: "10:00" },
      { pushToken: "secret" },
      { userId: "other" },
    ])
      expect(
        notificationPreferencesSchema.safeParse({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...fields,
        }).success,
      ).toBe(false);
  });
  it.each(["review", "blocker", "mention", "done", "digest"] as const)(
    "quiet suppresses %s except enabled blockers",
    (kind) => {
      expect(
        shouldShowForegroundNotification(
          { ...DEFAULT_NOTIFICATION_PREFERENCES, quiet: true },
          kind,
          "2026-10-09T14:00:00Z",
          "+08:00",
        ),
      ).toBe(kind === "blocker");
      expect(
        shouldShowForegroundNotification(
          { ...DEFAULT_NOTIFICATION_PREFERENCES, quiet: true },
          kind,
          "2026-10-09T00:00:00Z",
          "+08:00",
        ),
      ).toBe(true);
      const field = kind === "blocker" ? "block" : kind;
      expect(
        shouldShowForegroundNotification(
          { ...DEFAULT_NOTIFICATION_PREFERENCES, [field]: false },
          kind,
          "2026-10-09T01:00:00Z",
          "+08:00",
        ),
      ).toBe(false);
    },
  );
  it("quiet boundary follows current saved DST zone, not UTC or serverzone", () => {
    expect(
      shouldShowForegroundNotification(
        { ...DEFAULT_NOTIFICATION_PREFERENCES, quiet: true },
        "review",
        "2026-11-01T12:59:59Z",
        "America/New_York",
      ),
    ).toBe(false);
    expect(
      shouldShowForegroundNotification(
        { ...DEFAULT_NOTIFICATION_PREFERENCES, quiet: true },
        "review",
        "2026-11-01T13:00:00Z",
        "America/New_York",
      ),
    ).toBe(true);
  });
  it("jobs and recipient event metadata are strict with no private snapshot accepted", () => {
    const job = {
      userId: "person",
      scheduledAt: "2026-10-09T09:00:00+08:00",
      preferenceVersion: 1,
    };
    expect(digestJobSchema.safeParse(job).success).toBe(true);
    for (const fields of [
      { preferenceVersion: 0 },
      { scheduledAt: "2026-10-09T09:00:00" },
      { userId: "" },
      { snapshot: {} },
    ])
      expect(digestJobSchema.safeParse({ ...job, ...fields }).success).toBe(
        false,
      );
    const id = "00000000-0000-4000-8000-000000000001";
    const event = {
      activityId: id,
      workspaceId: id,
      resourceId: id,
      action: "daily_digests.insert",
      actorId: "system:daily-digest",
      userId: "person",
      recipientOnly: true,
    };
    expect(changeEventSchema.safeParse(event).success).toBe(true);
    expect(
      changeEventSchema.safeParse({ ...event, snapshot: {} }).success,
    ).toBe(false);
  });
});
