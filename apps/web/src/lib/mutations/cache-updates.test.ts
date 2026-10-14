import type {
  AgentPermissionInput,
  AgentProfile,
  AgentToken,
  CalendarViewData,
  CreateTask,
  Grant,
  Inbox,
  InboxItem,
  Me,
  Member,
  Project,
  Task,
  WorkspaceInvite,
} from "@taff/schemas";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  decidedGrantStatus,
  optimisticGrant,
  withAgentPermission,
  withAgentProfileInput,
  withGrantDecision,
  withPendingGrant,
} from "./agents";
import { optimisticCalendarTask, withCreatedOccurrence } from "./calendar";
import { withInboxUpdate } from "./inbox";
import { optimisticAgentToken, withRevokedToken } from "./mcp";
import {
  invalidateWorkspaces,
  optimisticAgentMember,
  optimisticInvite,
  withMemberRole,
  withRevokedInvite,
} from "./organizations";
import { withProjectSave } from "./projects";
import { replaceById } from "./replace";
import { controlOutcome, reviewDraftKey, reviewOutcome } from "./review";
import { withProfile } from "./session";
import {
  optimisticQuickAddTask,
  optimisticRun,
  optimisticSubtask,
} from "./tasks";

const NOW = "2026-10-14T09:00:00.000Z";

function inboxItem(patch: Partial<InboxItem>): InboxItem {
  return {
    id: "item",
    workspaceId: "ws",
    memberId: "me",
    agentId: null,
    taskId: "task",
    runId: null,
    grantId: null,
    kind: "review",
    digestId: null,
    title: "Review",
    readAt: null,
    snoozedUntil: null,
    resolvedAt: null,
    createdAt: NOW,
    ...patch,
  };
}

function profile(patch: Partial<AgentProfile> = {}) {
  return {
    member: { id: "agent", workspaceId: "ws" },
    supervisorId: null,
    reviewPolicy: "always",
    maxDurationMs: null,
    maxCostMicros: null,
    permissions: [
      { capability: "web.search", decision: "ask" },
      { capability: "files.write", decision: "deny" },
    ],
    grants: [],
    runs: [],
    ...patch,
  } as unknown as AgentProfile;
}

describe("session", () => {
  it("updates locale and time zone and leaves a signed-out cache alone", () => {
    const me = { user: { id: "u", locale: "en", tz: "UTC" } } as Me;
    expect(withProfile(me, "zh-HK", "Asia/Hong_Kong")?.user).toEqual({
      id: "u",
      locale: "zh-HK",
      tz: "Asia/Hong_Kong",
    });
    expect(me.user.locale).toBe("en");
    expect(withProfile(null, "en", "UTC")).toBeNull();
    expect(withProfile(undefined, "en", "UTC")).toBeUndefined();
  });
});

describe("agents", () => {
  it("merges profile input and replaces only the matching permission", () => {
    const current = profile();
    expect(
      withAgentProfileInput(current, { supervisorId: "boss" } as never)
        ?.supervisorId,
    ).toBe("boss");
    const next = withAgentPermission(current, {
      capability: "web.search",
      decision: "allow",
    } as AgentPermissionInput);
    expect(next?.permissions).toEqual([
      { capability: "web.search", decision: "allow" },
      { capability: "files.write", decision: "deny" },
    ]);
    expect(withAgentPermission(undefined, {} as AgentPermissionInput)).toBe(
      undefined,
    );
  });

  it("prepends a pending grant and applies decisions to the grant only", () => {
    const grant = optimisticGrant(
      { id: "agent", workspaceId: "ws" },
      { capability: "web.search", reason: "Need it", taskId: "task" },
      "optimistic:1",
      NOW,
    );
    expect(grant).toMatchObject({
      id: "optimistic:1",
      agentId: "agent",
      workspaceId: "ws",
      taskId: "task",
      runId: null,
      status: "pending",
      decidedBy: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const older = { ...grant, id: "older", expiresAt: NOW } as Grant;
    const current = withPendingGrant(profile({ grants: [older] }), grant);
    expect(current?.grants.map((item) => item.id)).toEqual([
      "optimistic:1",
      "older",
    ]);
    const allowed = withGrantDecision(
      current,
      "optimistic:1",
      { decision: "allow", expiresAt: "2026-10-15T09:00:00.000Z" },
      "me",
    );
    expect(allowed?.grants[0]).toMatchObject({
      status: "allowed",
      expiresAt: "2026-10-15T09:00:00.000Z",
      decidedBy: "me",
    });
    expect(allowed?.grants[1]).toBe(older);
    const revoked = withGrantDecision(
      allowed,
      "older",
      { decision: "revoke" },
      undefined,
    );
    expect(revoked?.grants[1]).toMatchObject({
      status: "revoked",
      expiresAt: NOW,
      decidedBy: null,
    });
    expect(decidedGrantStatus("deny")).toBe("denied");
  });
});

describe("calendar", () => {
  it("adds the created task's occurrence only when a slot was chosen", () => {
    const body = {
      workspaceId: "ws",
      ownerId: "me",
      workerId: null,
      title: "Meet",
      calendar: {
        startAt: "2026-10-14T10:00:00.000Z",
        endAt: "2026-10-14T11:00:00.000Z",
        timeZone: "UTC",
        rrule: null,
      },
    } as CreateTask;
    const task = optimisticCalendarTask(body, "optimistic:t", NOW);
    expect(task).toMatchObject({
      id: "optimistic:t",
      number: 0,
      status: "todo",
      priority: 3,
      labels: [],
      dueAt: null,
      workerId: null,
      version: 1,
      createdAt: NOW,
    });
    const data = {
      occurrences: [],
      unscheduled: [],
      truncated: false,
    } as CalendarViewData;
    const next = withCreatedOccurrence(data, task, body.calendar, "ws");
    expect(next?.occurrences).toEqual([
      {
        id: "optimistic:t",
        task,
        schedule: {
          ...body.calendar,
          taskId: "optimistic:t",
          workspaceId: "ws",
        },
        startAt: "2026-10-14T10:00:00.000Z",
        endAt: "2026-10-14T11:00:00.000Z",
        canSchedule: false,
        isAgent: false,
      },
    ]);
    expect(withCreatedOccurrence(data, task, undefined, "ws")).toBe(data);
    expect(withCreatedOccurrence(undefined, task, body.calendar, "ws")).toBe(
      undefined,
    );
  });
});

describe("inbox", () => {
  it("marks read and unread and recomputes the counts", () => {
    const current: Inbox = {
      items: [inboxItem({ id: "a" }), inboxItem({ id: "b", kind: "blocker" })],
      groups: [],
      unreadCount: 2,
      reviewCount: 1,
      blockerCount: 1,
    };
    const read = withInboxUpdate(
      current,
      { id: "a", body: { read: true } },
      null,
      NOW,
    );
    expect(read?.items[0].readAt).toBe(NOW);
    expect(read).toMatchObject({
      unreadCount: 1,
      reviewCount: 0,
      blockerCount: 1,
    });
    const unread = withInboxUpdate(
      read,
      { id: "a", body: { read: false } },
      null,
      NOW,
    );
    expect(unread?.items[0].readAt).toBeNull();
  });

  it("hides a snoozed item and restores it on undo", () => {
    const item = inboxItem({ id: "a" });
    const current: Inbox = {
      items: [item],
      groups: [],
      unreadCount: 1,
      reviewCount: 1,
      blockerCount: 0,
    };
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const snoozed = withInboxUpdate(
      current,
      { id: "a", body: { snoozedUntil: later } },
      null,
      NOW,
    );
    expect(snoozed?.items).toEqual([]);
    const undone = withInboxUpdate(
      snoozed,
      { id: "a", body: { snoozedUntil: null }, undo: true },
      item,
      NOW,
    );
    expect(undone?.items).toEqual([item]);
    expect(undone?.unreadCount).toBe(1);
    expect(withInboxUpdate(undefined, { id: "a", body: {} }, item, NOW)).toBe(
      undefined,
    );
  });
});

describe("mcp", () => {
  it("builds the optimistic token and marks only the revoked one", () => {
    const token = optimisticAgentToken(
      {
        workspaceId: "ws",
        memberId: "agent",
        name: "CI",
        scopes: ["tasks:read"],
      },
      "optimistic:k",
      "me",
      NOW,
    );
    expect(token).toEqual({
      workspaceId: "ws",
      memberId: "agent",
      name: "CI",
      scopes: ["tasks:read"],
      id: "optimistic:k",
      createdBy: "me",
      prefix: "",
      createdAt: NOW,
      revokedAt: null,
      lastUsedAt: null,
    });
    const other = { ...token, id: "other" } as AgentToken;
    const next = withRevokedToken([token, other], "optimistic:k", NOW);
    expect(next[0].revokedAt).toBe(NOW);
    expect(next[1]).toBe(other);
    expect(withRevokedToken(undefined, "x", NOW)).toEqual([]);
  });
});

describe("organizations", () => {
  it("adds agents, changes roles and swaps optimistic rows", () => {
    const agent = optimisticAgentMember("ws", "Scout", "optimistic:a");
    expect(agent).toEqual({
      id: "optimistic:a",
      workspaceId: "ws",
      userId: null,
      name: "Scout",
      kind: "agent",
      role: "member",
    });
    const human = { ...agent, id: "h", kind: "person" } as Member;
    expect(withMemberRole([agent, human], "h", "admin")?.[1].role).toBe(
      "admin",
    );
    expect(withMemberRole(undefined, "h", "admin")).toBeUndefined();
    const saved = { ...agent, id: "server" };
    expect(replaceById([agent, human], "optimistic:a", saved)).toEqual([
      saved,
      human,
    ]);
    expect(replaceById(undefined, "x", saved)).toBeUndefined();
  });

  it("builds a seven-day pending invite and revokes by id", () => {
    const now = Date.parse(NOW);
    const invite = optimisticInvite(
      "ws",
      { email: "a@example.com", role: "member" },
      "optimistic:i",
      now,
    );
    expect(invite).toEqual({
      email: "a@example.com",
      role: "member",
      id: "optimistic:i",
      workspaceId: "ws",
      status: "pending",
      createdAt: NOW,
      expiresAt: "2026-10-21T09:00:00.000Z",
    });
    const other = { ...invite, id: "other" } as WorkspaceInvite;
    const next = withRevokedInvite([invite, other], "optimistic:i");
    expect(next?.map((item) => item.status)).toEqual(["revoked", "pending"]);
  });

  it("skips the refresh while another write is still running", async () => {
    const client = new QueryClient();
    let resolve = () => {};
    const blocker = new Promise<void>((done) => {
      resolve = done;
    });
    const running = [0, 1].map(() =>
      client
        .getMutationCache()
        .build(client, { mutationFn: () => blocker })
        .execute(undefined),
    );
    expect(client.isMutating()).toBe(2);
    expect(invalidateWorkspaces(client)).toBeUndefined();
    resolve();
    await Promise.all(running);
    expect(invalidateWorkspaces(client)).toBeInstanceOf(Promise);
  });
});

describe("projects", () => {
  const project: Project = {
    id: "p",
    workspaceId: "ws",
    name: "Old",
    archived: false,
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
  it("appends a new project and edits an existing one in place", () => {
    const created = withProjectSave(
      [project],
      "new",
      "ws",
      "optimistic:p",
      { name: "New" },
      NOW,
    );
    expect(created[1]).toEqual({
      id: "optimistic:p",
      workspaceId: "ws",
      name: "New",
      archived: false,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const edited = withProjectSave(
      [project],
      "edit",
      "ws",
      "p",
      { name: "Renamed", version: 2, archived: true },
      NOW,
    );
    expect(edited).toEqual([{ ...project, name: "Renamed", archived: true }]);
  });
});

describe("review and run control", () => {
  it("maps decisions and actions to run and task status", () => {
    expect(reviewOutcome("approve")).toEqual({
      run: "completed",
      task: "done",
    });
    expect(reviewOutcome("request_changes")).toEqual({
      run: "changes_requested",
      task: "in_progress",
    });
    expect(controlOutcome("pause")).toEqual({
      run: "paused",
      task: "in_progress",
    });
    expect(controlOutcome("resume")).toEqual({
      run: "running",
      task: "in_progress",
    });
    expect(controlOutcome("cancel")).toEqual({ run: "canceled", task: "todo" });
  });

  it("clears the draft of the item the comment answered", () => {
    expect(reviewDraftKey({ version: 1, body: "x", artifactId: "art" })).toBe(
      "art",
    );
    expect(reviewDraftKey({ version: 1, body: "x", eventId: "ev" })).toBe("ev");
    expect(reviewDraftKey({ version: 1, body: "x" })).toBe("overall");
  });
});

describe("tasks", () => {
  const parent = {
    id: "parent",
    workspaceId: "ws",
    number: 7,
    title: "Parent",
    description: "Body",
    ownerId: "me",
    workerId: "agent",
    projectId: "p",
    parentId: null,
    labels: ["x"],
    priority: 1,
    status: "in_progress",
    dueAt: NOW,
    version: 4,
    createdAt: NOW,
    updatedAt: NOW,
  } as Task;

  it("fills quick-add defaults", () => {
    expect(
      optimisticQuickAddTask(
        { workspaceId: "ws", ownerId: "me", title: "Draft" } as CreateTask,
        "optimistic:q",
        NOW,
      ),
    ).toEqual({
      workspaceId: "ws",
      ownerId: "me",
      title: "Draft",
      id: "optimistic:q",
      number: 0,
      description: "",
      priority: 3,
      projectId: null,
      parentId: null,
      labels: [],
      dueAt: null,
      status: "todo",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("derives a subtask from its parent", () => {
    expect(optimisticSubtask(parent, "Child", "optimistic:s", "later")).toEqual(
      {
        ...parent,
        id: "optimistic:s",
        title: "Child",
        parentId: "parent",
        workerId: null,
        status: "todo",
        description: "",
        labels: [],
        version: 1,
        createdAt: "later",
        updatedAt: "later",
      },
    );
  });

  it("starts a running run for the task's worker", () => {
    expect(optimisticRun(parent, "optimistic:r", NOW)).toEqual({
      id: "optimistic:r",
      workspaceId: "ws",
      taskId: "parent",
      agentId: "agent",
      status: "running",
      version: 1,
      summary: "",
      startedAt: NOW,
      finishedAt: null,
      updatedAt: NOW,
      durationMs: 0,
      costMicros: 0,
    });
  });
});
