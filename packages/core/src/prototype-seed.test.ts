import { calendarWallToInstant } from "@taff/schemas";
import {
  presentPrototypeField,
  prototypeAgents,
  prototypeId,
  prototypeMeetings,
  prototypeOrgs,
  prototypePeople,
  prototypeTaskReference,
  prototypeTasks,
} from "@taff/schemas/prototype-data";
import { describe, expect, it } from "vitest";
import {
  expandCalendarSchedule,
  normalizeCalendarSchedule,
} from "./calendar-recurrence";

describe("prototype presentation content", () => {
  it("translates only unchanged real fixture fields and retains references after edits", () => {
    const row = prototypeTasks.find(
      (task) => task.org === "nw" && task.number === 141,
    )!;
    const id = prototypeId("task", "nw", 141);
    expect(presentPrototypeField(id, "title", row.title["zh-HK"], "en")).toBe(
      "Competitive checkout teardown",
    );
    expect(
      presentPrototypeField(id, "title", row.title["zh-HK"], "zh-CN"),
    ).toBe("竞品结账流程调研");
    expect(presentPrototypeField(id, "title", "My edited title", "en")).toBe(
      "My edited title",
    );
    expect(
      presentPrototypeField(
        prototypeId("task", "nw", 999),
        "title",
        row.title["zh-HK"],
        "en",
      ),
    ).toBe(row.title["zh-HK"]);
    expect(prototypeTaskReference(id)).toBe("NW-141");
    expect(prototypeTaskReference(prototypeId("task", "nw", 999))).toBeNull();
  });
  it("uses distinct stable identities for all organizations, members, projects and tasks", () => {
    const ids = prototypeOrgs.flatMap((org) => [
      prototypeId("workspace", org.key),
      prototypeId("project", org.key),
      ...prototypePeople
        .filter((person) =>
          (org.people as readonly string[]).includes(person.key),
        )
        .map((person) => prototypeId("member", org.key, person.number)),
      ...prototypeAgents
        .filter((agent) =>
          (org.agents as readonly string[]).includes(agent.key),
        )
        .map((agent) => prototypeId("member", org.key, agent.number)),
      ...prototypeTasks
        .filter((task) => task.org === org.key)
        .map((task) => prototypeId("task", org.key, task.number)),
      ...prototypeMeetings
        .filter((meeting) => meeting.org === org.key)
        .map((meeting) => prototypeId("task", org.key, meeting.number)),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      ids.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          id,
        ),
      ),
    ).toBe(true);
    expect(prototypeTasks.filter((task) => task.org === "nw")).toHaveLength(12);
  });
  it("compresses the prototype's 25 meetings into real bounded recurring schedules without extra slots", () => {
    const schedules = prototypeMeetings
      .filter((meeting) => meeting.org === "nw")
      .map((meeting) => {
        const at = (minutes: number) =>
          calendarWallToInstant(
            `2026-10-${meeting.day.toString().padStart(2, "0")}T${Math.floor(
              minutes / 60,
            )
              .toString()
              .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`,
            "Asia/Hong_Kong",
          );
        return normalizeCalendarSchedule({
          startAt: at(meeting.start),
          endAt: at(meeting.start + meeting.duration),
          timeZone: "Asia/Hong_Kong",
          rrule: meeting.rrule ?? null,
        });
      });
    const month = schedules.flatMap(
      (schedule) =>
        expandCalendarSchedule(schedule, {
          from: "2026-10-01T00:00:00Z",
          to: "2026-11-01T00:00:00Z",
        }).occurrences,
    );
    expect(month).toHaveLength(25);
    const today = schedules.flatMap(
      (schedule) =>
        expandCalendarSchedule(schedule, {
          from: "2026-10-07T16:00:00Z",
          to: "2026-10-08T16:00:00Z",
        }).occurrences,
    );
    expect(today.map((slot) => slot.startAt).sort()).toEqual([
      "2026-10-08T01:30:00.000Z",
      "2026-10-08T06:00:00.000Z",
      "2026-10-08T08:30:00.000Z",
    ]);
  });
});
