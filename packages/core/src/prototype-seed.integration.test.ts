import { randomUUID } from "node:crypto";
import {
  account,
  activity,
  connectDatabase,
  members,
  taskCalendar,
  tasks,
  user,
} from "@taff/db";
import {
  type ChangeEvent,
  calendarCivilTime,
  calendarWallToInstant,
} from "@taff/schemas";
import {
  prototypeId,
  prototypeOrgs,
  prototypePeople,
  prototypeTasks,
} from "@taff/schemas/prototype-data";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";
import { seedPrototype } from "./prototype-seed";
import { seedDemo } from "./seed";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP prototype seed PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Prototype seed tests require an isolated _test database");
const options = {
  databaseUrl: url ?? "",
  authUrl: "http://localhost:3000",
  authSecret: "prototype-test-secret-at-least-thirty-two-characters",
  tokenPepper: "prototype-test-pepper-at-least-sixteen",
};
const w = prototypeId("workspace", "nw");
const p = prototypeId("project", "nw");
const password = `fixture-${randomUUID()}`;
describe.skipIf(!url)("real prototype seed PostgreSQL", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alexId: string;
  let unrelatedId: string;
  let unrelatedEmail: string;
  const changes: ChangeEvent[] = [];
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    const [version] = await connection.client`show server_version_num`;
    expect(Number(version.server_version_num)).toBeGreaterThanOrEqual(180000);
    core = createCore(options);
    await core.subscribeChanges((event) => {
      changes.push(event);
    });
    unrelatedEmail = `${randomUUID()}@seed-test.local`;
    const unrelated = await core.auth.api.signUpEmail({
      body: { name: "Unrelated seed test", email: unrelatedEmail, password },
    });
    unrelatedId = unrelated.user.id;
    await seedDemo({ ...options, password, seedDate: "2026-10-08" });
    alexId = (
      await connection.db
        .select()
        .from(user)
        .where(eq(user.email, "alex@taff.local"))
    )[0].id;
    await vi.waitFor(() => expect(changes.length).toBeGreaterThan(0));
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });
  it("stores the exact Checkout hierarchy and isolated real organization memberships", async () => {
    const actor = userPrincipal(alexId);
    const rows = (await core.listTasks(actor, w)).filter(
      (row) => row.projectId === p,
    );
    expect(rows).toHaveLength(12);
    expect(
      Object.fromEntries(
        ["todo", "in_progress", "needs_review", "done"].map((status) => [
          status,
          rows.filter((row) => row.status === status).length,
        ]),
      ),
    ).toEqual({ todo: 3, in_progress: 4, needs_review: 2, done: 3 });
    expect(
      rows
        .filter((row) => row.parentId === prototypeId("task", "nw", 140))
        .map((row) => row.id)
        .sort(),
    ).toEqual(
      [138, 139, 142, 144, 145]
        .map((key) => prototypeId("task", "nw", key))
        .sort(),
    );
    const team = await core.listMembers(actor, w);
    expect(
      team.filter((row) =>
        prototypePeople
          .slice(0, 5)
          .some(
            (person) => row.id === prototypeId("member", "nw", person.number),
          ),
      ),
    ).toHaveLength(5);
    expect(team.filter((row) => row.kind === "agent")).toHaveLength(3);
    expect(team.find((row) => row.userId === alexId)).toMatchObject({
      name: "林曉",
      role: "admin",
    });
    expect((await core.getMe(alexId)).workspaces.map((row) => row.id)).toEqual(
      expect.arrayContaining(
        prototypeOrgs.map((org) => prototypeId("workspace", org.key)),
      ),
    );
    await expect(
      core.listTasks(userPrincipal(unrelatedId), w),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("exposes authoritative review, completed evidence and pending scoped blocker state", async () => {
    const actor = userPrincipal(alexId);
    for (const number of [141, 142]) {
      const review = await core.getReview(
        actor,
        prototypeId("task", "nw", number),
      );
      expect(review.canReview).toBe(true);
      expect(review.run.status).toBe("needs_review");
      expect(review.checks).toEqual({
        matchesDescription: false,
        verifiable: false,
        withinPermissions: false,
      });
      expect(review.artifacts).toHaveLength(1);
      expect(review.artifacts[0]).toMatchObject({ mimeType: "text/markdown" });
      expect(review.artifacts[0].content).toContain("Prototype sample data");
      await expect(
        core.reviewRun(actor, review.run.id, {
          version: review.run.version,
          decision: "approve",
          checks: review.checks,
          comment: "",
          items: [
            {
              artifactId: review.artifacts[0].id,
              decision: "approve",
              comment: "",
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
    const completed = await core.getReview(
      actor,
      prototypeId("task", "nw", 135),
    );
    expect(completed.run.status).toBe("completed");
    expect(Object.values(completed.checks).every(Boolean)).toBe(true);
    const working = await core.getRun(actor, prototypeId("run", "nw", 138));
    expect(working.run.status).toBe("running");
    expect(working.events).toHaveLength(2);
    expect(working.run.costMicros).toBe(0);
    const ops = await core.getAgentProfile(
      actor,
      prototypeId("member", "nw", 13),
    );
    expect(ops.reviewPolicy).toBe("always_review");
    expect(ops.permissions).toContainEqual({
      capability: "staging.write",
      decision: "ask",
    });
    expect(ops.grants).toContainEqual(
      expect.objectContaining({
        id: prototypeId("grant", "nw", 144),
        status: "pending",
        taskId: prototypeId("task", "nw", 144),
        runId: prototypeId("run", "nw", 144),
      }),
    );
    expect(
      (await core.getRun(actor, prototypeId("run", "nw", 144))).run.status,
    ).toBe("paused");
    const inbox = await core.listInbox(actor, w, {});
    expect(inbox.items.filter((row) => row.kind === "review")).toHaveLength(2);
    expect(inbox.items.filter((row) => row.kind === "blocker")).toHaveLength(1);
    expect(inbox.items.filter((row) => row.kind === "mention")).toHaveLength(1);
  });
  it("expands genuine recurring meeting tasks without changing project or deadline counts", async () => {
    const [anchor] = await connection.db
      .select()
      .from(taskCalendar)
      .where(eq(taskCalendar.taskId, prototypeId("task", "nw", 1001)));
    const start = calendarCivilTime(anchor.startAt, anchor.timeZone);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 31);
    const calendar = await core.listCalendar(userPrincipal(alexId), w, {
      from: calendarWallToInstant(
        `${start.toISOString().slice(0, 10)}T00:00`,
        anchor.timeZone,
      ),
      to: calendarWallToInstant(
        `${end.toISOString().slice(0, 10)}T00:00`,
        anchor.timeZone,
      ),
    });
    expect(calendar.truncated).toBe(false);
    const meetings = calendar.occurrences.filter((row) =>
      row.task.labels.includes("meeting"),
    );
    expect(meetings).toHaveLength(25);
    expect(
      meetings.every(
        (row) => row.task.projectId === null && row.task.dueAt === null,
      ),
    ).toBe(true);
    expect(
      calendar.occurrences.filter((row) => row.task.projectId === p),
    ).toHaveLength(4);
  });
  it("serializes repeated concurrent seeds without new activity or password changes", async () => {
    const workspaceIds = prototypeOrgs.map((org) =>
      prototypeId("workspace", org.key),
    );
    const before = await connection.db
      .select()
      .from(activity)
      .where(inArray(activity.workspaceId, workspaceIds));
    const identities = await connection.db
      .select()
      .from(user)
      .where(
        inArray(
          user.email,
          prototypePeople.map((row) => row.email),
        ),
      );
    const credentials = await connection.db
      .select()
      .from(account)
      .where(
        inArray(
          account.userId,
          identities.map((row) => row.id),
        ),
      );
    const results = await Promise.all([
      seedDemo({
        ...options,
        password: `changed-${randomUUID()}`,
        seedDate: "2026-10-08",
      }),
      seedDemo({
        ...options,
        password: `changed-${randomUUID()}`,
        seedDate: "2026-10-09",
      }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(inArray(activity.workspaceId, workspaceIds)),
    ).toEqual(before);
    expect(
      await connection.db
        .select()
        .from(account)
        .where(
          inArray(
            account.userId,
            identities.map((row) => row.id),
          ),
        ),
    ).toEqual(credentials);
    expect(
      await connection.db
        .select()
        .from(user)
        .where(
          inArray(
            user.email,
            prototypePeople.map((row) => row.email),
          ),
        ),
    ).toEqual(identities);
    const login = await core.auth.api.signInEmail({
      body: { email: unrelatedEmail, password },
    });
    expect(login.user.id).toBe(unrelatedId);
  }, 30000);
  it("preserves edited fixture versions and rolls back fixture writes without notifications", async () => {
    const actor = userPrincipal(alexId);
    const id = prototypeId("task", "nw", 145);
    const original = await core.getTask(actor, id);
    const edited = await core.updateTask(actor, id, {
      version: original.version,
      title: "Edited real demo title",
    });
    try {
      await seedDemo({ ...options, password, seedDate: "2026-10-08" });
      expect(await core.getTask(actor, id)).toEqual(edited);
    } finally {
      const current = await core.getTask(actor, id);
      await core.updateTask(actor, id, {
        version: current.version,
        title: original.title,
      });
    }
    const target = prototypeId("task", "nw", 1016);
    const before = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.workspaceId, w));
    const beforeChanges = changes.filter(
      (event) => event.resourceId === target,
    ).length;
    const people = await connection.db
      .select()
      .from(user)
      .where(
        inArray(
          user.email,
          prototypePeople.map((person) => person.email),
        ),
      );
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${alexId},true)`,
        );
        await tx.delete(tasks).where(eq(tasks.id, target));
        await seedPrototype(tx, people, {
          seedDate: "2026-10-08",
          timeZone: people.find((person) => person.id === alexId)!.tz,
        });
        expect(
          await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, target), eq(tasks.workspaceId, w))),
        ).toHaveLength(1);
        throw new Error("fixture rollback probe");
      }),
    ).rejects.toThrow("fixture rollback probe");
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.workspaceId, w)),
    ).toEqual(before);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(changes.filter((event) => event.resourceId === target)).toHaveLength(
      beforeChanges,
    );
    expect(prototypeTasks.filter((task) => task.org === "nw")).toHaveLength(12);
  }, 30000);
});
