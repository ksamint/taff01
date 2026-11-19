import type { Task } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { todayTasks } from "./today";

describe("Today in the user's time zone", () => {
  it("separates undated tasks from local-day tasks and excludes completed, other-day, and undated meetings", () => {
    const task = {
      id: "1",
      workspaceId: "w",
      number: 1,
      title: "Task",
      description: "",
      priority: 3,
      projectId: null,
      labels: [],
      parentId: null,
      version: 1,
      ownerId: "m",
      workerId: null,
      status: "todo",
      dueAt: null,
      createdAt: "2026-10-08T00:00:00Z",
      updatedAt: "2026-10-08T00:00:00Z",
    } satisfies Task;
    const tasks: Task[] = [
      task,
      { ...task, id: "2", dueAt: "2026-10-07T18:00:00Z" },
      { ...task, id: "3", dueAt: "2026-10-08T18:00:00Z" },
      { ...task, id: "4", status: "done" },
      { ...task, id: "5", dueAt: "2026-10-07T10:00:00Z" },
      { ...task, id: "6", dueAt: "2026-10-08T10:00:00Z" },
      { ...task, id: "7", labels: ["meeting"] },
    ];
    const now = new Date("2026-10-08T00:00:00Z");
    const ids = (tasks: Task[]) => tasks.map(({ id }) => id);
    const singapore = todayTasks(tasks, "Asia/Singapore", now);
    expect(ids(singapore.due)).toEqual(["2", "6"]);
    expect(ids(singapore.undated)).toEqual(["1"]);
    const losAngeles = todayTasks(tasks, "America/Los_Angeles", now);
    expect(ids(losAngeles.due)).toEqual(["2", "5"]);
    expect(ids(losAngeles.undated)).toEqual(["1"]);
  });
});
