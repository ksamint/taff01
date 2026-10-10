import type { Me, Task } from "@taff/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreError } from "./index";
import { createTodayBootstrap } from "./today-bootstrap";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const instant = "2026-01-02T04:00:00.000Z";
const me: Me = {
  user: {
    id: "person",
    name: "Person",
    email: "person@example.test",
    locale: "en",
    tz: "Asia/Hong_Kong",
  },
  workspaces: [1, 2].map((n) => ({
    id: id(n),
    name: `Workspace ${n}`,
    key: "WS",
    memberId: id(n + 2),
    role: "admin",
  })),
};
const task: Task = {
  id: id(10),
  workspaceId: id(1),
  number: 1,
  title: "Keep all tasks",
  description: "",
  priority: 4,
  projectId: null,
  labels: [],
  parentId: null,
  version: 1,
  ownerId: id(3),
  workerId: null,
  status: "done",
  dueAt: null,
  createdAt: instant,
  updatedAt: instant,
};
function setup(person: Me = me) {
  const reads = {
    getMe: vi.fn().mockResolvedValue(person),
    listTasks: vi.fn().mockResolvedValue([]),
    listMembers: vi.fn().mockResolvedValue([]),
    listRuns: vi.fn().mockResolvedValue([]),
    listCalendar: vi.fn().mockResolvedValue({
      occurrences: [],
      unscheduled: [],
      truncated: false,
    }),
  };
  return {
    reads,
    bootstrap: createTodayBootstrap(reads, () => Date.parse(instant)),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("authorized Today bootstrap", () => {
  it.each([
    [{}, 1],
    [{ workspaceId: id(2) }, 1],
    [{ preferredUserId: "other", workspaceId: id(2) }, 1],
    [{ preferredUserId: "person", workspaceId: id(99) }, 1],
    [{ preferredUserId: "person", workspaceId: id(2) }, 2],
  ])(
    "uses only authorized membership for preference %j",
    async (query, selected) => {
      const { reads, bootstrap } = setup();
      const result = await bootstrap("person", query);
      expect(result.today?.workspaceId).toBe(id(selected));
      expect(reads.getMe).toHaveBeenCalledWith("person");
      for (const read of [reads.listTasks, reads.listMembers, reads.listRuns])
        expect(read).toHaveBeenCalledWith(
          { kind: "user", userId: "person" },
          id(selected),
        );
      expect(reads.listCalendar).toHaveBeenCalledWith(
        { kind: "user", userId: "person" },
        id(selected),
        { from: "2026-01-01T16:00:00.000Z", to: "2026-01-02T16:00:00.000Z" },
      );
    },
  );
  it("returns no Today data or collection reads without membership", async () => {
    const { reads, bootstrap } = setup({ ...me, workspaces: [] });
    expect(
      await bootstrap("person", {
        preferredUserId: "person",
        workspaceId: id(99),
      }),
    ).toEqual({ me: { ...me, workspaces: [] }, today: null });
    for (const read of [
      reads.listTasks,
      reads.listMembers,
      reads.listRuns,
      reads.listCalendar,
    ])
      expect(read).not.toHaveBeenCalled();
  });
  it("rejects mismatched authenticated Me before any collection reads", async () => {
    const { reads, bootstrap } = setup({
      ...me,
      user: { ...me.user, id: "other" },
    });
    await expect(bootstrap("person")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(reads.listTasks).not.toHaveBeenCalled();
    expect(reads.listCalendar).not.toHaveBeenCalled();
  });
  it("keeps the full collection including completed tasks", async () => {
    const { reads, bootstrap } = setup();
    const tasks = Array.from({ length: 350 }, (_, n) => ({
      ...task,
      id: id(n + 100),
      number: n + 1,
    }));
    reads.listTasks.mockResolvedValue(tasks);
    expect((await bootstrap("person")).today?.tasks).toEqual(tasks);
    expect(reads.listTasks.mock.calls[0]).toHaveLength(2);
  });
  it.each([
    [
      "2026-03-08T16:00:00Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
      23,
    ],
    [
      "2026-11-01T16:00:00Z",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
      25,
    ],
  ])(
    "uses local civil midnight across DST at %s",
    async (now, from, to, hours) => {
      const { reads } = setup({
        ...me,
        user: { ...me.user, tz: "America/New_York" },
      });
      const result = await createTodayBootstrap(reads, () => Date.parse(now))(
        "person",
      );
      expect(result.today).toMatchObject({ now: Date.parse(now), from, to });
      expect((Date.parse(to) - Date.parse(from)) / 3600000).toBe(hours);
    },
  );
  it("rejects a failed membership recheck without a partial envelope", async () => {
    const { reads, bootstrap } = setup();
    reads.listMembers.mockRejectedValue(new CoreError("forbidden", 403));
    await expect(bootstrap("person")).rejects.toMatchObject({
      code: "forbidden",
    });
    for (const read of [
      reads.listTasks,
      reads.listMembers,
      reads.listRuns,
      reads.listCalendar,
    ])
      expect(read.mock.calls[0].slice(0, 2)).toEqual([
        { kind: "user", userId: "person" },
        id(1),
      ]);
  });
  it.each([
    "tasks",
    "members",
    "runs",
    "occurrences",
    "unscheduled",
    "schedule",
  ])("rejects foreign-workspace %s returned by a read", async (kind) => {
    const { reads, bootstrap } = setup();
    const foreignTask = { ...task, workspaceId: id(99) };
    const schedule = {
      taskId: task.id,
      workspaceId: id(1),
      startAt: instant,
      endAt: "2026-01-02T05:00:00.000Z",
      timeZone: "Asia/Hong_Kong",
      rrule: null,
    };
    if (kind === "tasks") reads.listTasks.mockResolvedValue([foreignTask]);
    if (kind === "members")
      reads.listMembers.mockResolvedValue([
        {
          id: id(3),
          workspaceId: id(99),
          userId: "person",
          name: "Person",
          kind: "person",
          role: "admin",
        },
      ]);
    if (kind === "runs")
      reads.listRuns.mockResolvedValue([
        {
          id: id(20),
          workspaceId: id(99),
          taskId: task.id,
          agentId: id(4),
          status: "paused",
          version: 1,
          summary: "",
          startedAt: instant,
          finishedAt: null,
          updatedAt: instant,
          durationMs: 0,
          costMicros: 0,
        },
      ]);
    if (kind === "occurrences")
      reads.listCalendar.mockResolvedValue({
        occurrences: [
          {
            id: "occurrence",
            task: foreignTask,
            schedule,
            startAt: instant,
            endAt: schedule.endAt,
            canSchedule: false,
            isAgent: false,
          },
        ],
        unscheduled: [],
        truncated: false,
      });
    if (kind === "unscheduled" || kind === "schedule")
      reads.listCalendar.mockResolvedValue({
        occurrences: [],
        unscheduled: [
          {
            task: kind === "unscheduled" ? foreignTask : task,
            schedule:
              kind === "schedule" ? { ...schedule, workspaceId: id(99) } : null,
            canSchedule: false,
          },
        ],
        truncated: false,
      });
    await expect(bootstrap("person")).rejects.toThrow();
  });
  it("rejects malformed query before any identity or workspace reads", async () => {
    const { reads, bootstrap } = setup();
    await expect(bootstrap("person", { workspaceId: "bad" })).rejects.toThrow();
    expect(reads.getMe).not.toHaveBeenCalled();
  });
});
