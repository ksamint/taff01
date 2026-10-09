import { describe, expect, it } from "vitest";
import * as base from "./base";
import * as calendar from "./calendar-read";
import * as changes from "./changes";
import * as inbox from "./inbox-read";
import * as root from "./index";
import * as preferences from "./notification-preferences";
import * as projects from "./project-read";
import * as runs from "./run-read";
import * as workspace from "./workspace-read";

describe("startup schema leaves", () => {
  it("reexports the same boundaries and preserves strict atomic-create validation", () => {
    for (const leaf of [
      base,
      calendar,
      changes,
      inbox,
      preferences,
      projects,
      runs,
      workspace,
    ]) {
      for (const [name, value] of Object.entries(leaf)) {
        expect(Reflect.get(root, name), name).toBe(value);
      }
    }
    const id = "00000000-0000-4000-8000-000000000001";
    const input = {
      workspaceId: id,
      ownerId: id,
      title: "  Atomic task  ",
      calendar: {
        startAt: "2026-10-10T08:00:00+08:00",
        endAt: "2026-10-10T09:00:00+08:00",
        timeZone: "+08:00",
      },
    };
    expect(base.createTaskSchema.parse(input)).toEqual({
      ...input,
      title: "Atomic task",
      workerId: null,
      calendar: { ...input.calendar, rrule: null },
    });
    expect(base.createTaskSchema.parse(input)).not.toHaveProperty("dueAt");
    for (const body of [
      { ...input, status: "done" },
      { ...input, ownerId: "outside-boundary" },
      {
        ...input,
        calendar: { ...input.calendar, endAt: input.calendar.startAt },
      },
      {
        ...input,
        calendar: { ...input.calendar, timeZone: "invalid" },
      },
    ]) {
      expect(base.createTaskSchema.safeParse(body).success).toBe(false);
      expect(() => root.createTaskSchema.parse(body)).toThrow(base.SchemaError);
    }
    expect(
      preferences.notificationPreferencesSchema.safeParse({
        ...preferences.DEFAULT_NOTIFICATION_PREFERENCES,
        version: 0,
      }).success,
    ).toBe(false);
    expect(
      changes.changeEventSchema.safeParse({
        activityId: id,
        workspaceId: id,
        resourceId: id,
        actorId: "actor",
        userId: null,
        action: "daily_digests.insert",
        token: "must not cross the realtime boundary",
      }).success,
    ).toBe(false);
  });
});
