import { describe, expect, it } from "vitest";
import {
  changeEventSchema,
  createTaskSchema,
  mcpTasksEditArgs,
  memberRoleInputSchema,
  searchInputSchema,
  taskSchema,
  updateTaskSchema,
  workspaceCreateSchema,
  workspaceInviteAcceptSchema,
} from "./index";

const id = "00000000-0000-4000-8000-000000000001";
describe("M5 strict shared boundaries", () => {
  it("preserves missing deadline and explicit clearing for subtask inheritance", () => {
    const base = { workspaceId: id, ownerId: id, title: "Child", parentId: id };
    expect(Object.hasOwn(createTaskSchema.parse(base), "dueAt")).toBe(false);
    expect(createTaskSchema.parse({ ...base, dueAt: null }).dueAt).toBeNull();
  });
  it.each([
    { priority: 0 },
    { priority: 5 },
    { priority: 1.5 },
    { labels: ["same", "same"] },
    { labels: ["x".repeat(41)] },
    { labels: Array.from({ length: 21 }, (_, i) => String(i)) },
  ])("rejects invalid rich task fields %j", (field) =>
    expect(
      createTaskSchema.safeParse({
        workspaceId: id,
        ownerId: id,
        title: "Task",
        ...field,
      }).success,
    ).toBe(false),
  );
  it.each([
    { version: 0, title: "x" },
    { version: 1.5, title: "x" },
    { version: 1 },
    { version: 1, parentId: id },
    { version: 1, workerId: id },
  ])("rejects invalid versioned task patch %j", (body) =>
    expect(updateTaskSchema.safeParse(body).success).toBe(false),
  );
  it("MCP edit cannot use taskId to satisfy required edit field", () => {
    expect(mcpTasksEditArgs.safeParse({ taskId: id, version: 1 }).success).toBe(
      false,
    );
    expect(
      mcpTasksEditArgs.safeParse({ taskId: id, version: 1, labels: [] })
        .success,
    ).toBe(true);
  });
  it("roles include guest, arbitrary roles are rejected", () => {
    expect(memberRoleInputSchema.parse({ role: "guest" })).toEqual({
      role: "guest",
    });
    expect(memberRoleInputSchema.safeParse({ role: "owner" }).success).toBe(
      false,
    );
  });
  it("accept is strict, raw invitation token never appears in change metadata", () => {
    expect(
      workspaceInviteAcceptSchema.safeParse({
        token: "a".repeat(43),
        role: "admin",
      }).success,
    ).toBe(false);
    const event = {
      activityId: id,
      workspaceId: id,
      resourceId: id,
      actorId: "user",
      userId: "member-user",
    };
    for (const table of ["projects", "task_comments", "workspace_invites"])
      expect(
        changeEventSchema.safeParse({ ...event, action: `${table}.insert` })
          .success,
      ).toBe(true);
    expect(
      changeEventSchema.safeParse({
        ...event,
        action: "workspace_invites.insert",
        token: "a".repeat(43),
      }).success,
    ).toBe(false);
  });
  it("limits search and rejects duplicated workspace-agent copy selections", () => {
    expect(
      searchInputSchema.safeParse({ query: "needle", limit: 101 }).success,
    ).toBe(false);
    expect(
      workspaceCreateSchema.safeParse({ name: "Org", agentIds: [id, id] })
        .success,
    ).toBe(false);
  });
  it("returned task version cannot be fractional or nonpositive", () => {
    const task = {
      id,
      workspaceId: id,
      number: 1,
      ownerId: id,
      workerId: null,
      title: "Task",
      description: "",
      priority: 3,
      labels: [],
      projectId: null,
      parentId: null,
      status: "todo",
      dueAt: null,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    };
    expect(taskSchema.safeParse({ ...task, version: 1 }).success).toBe(true);
    expect(taskSchema.safeParse({ ...task, version: 0 }).success).toBe(false);
  });
});
