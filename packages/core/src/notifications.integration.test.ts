import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  activity,
  connectDatabase,
  dailyDigests,
  inboxItems,
  members,
  notificationPreferences,
  tasks,
  user,
} from "@taff/db";
import {
  type ChangeEvent,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type DigestJob,
  dailyDigestListSchema,
  dailyDigestSchema,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDigestProcessor } from "../../../apps/worker/src/digests";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) console.warn("SKIP M7 PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M7 tests require isolated _test database");
describe.skipIf(!url)(
  "M7 durable recipient notifications and digest jobs",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    const changes: ChangeEvent[] = [];
    beforeAll(async () => {
      await migrateDatabase(url!);
      connection = connectDatabase(url!);
      const [server] = await connection.client`show server_version_num`;
      expect(Number(server.server_version_num)).toBeGreaterThanOrEqual(180000);
      core = createCore({
        databaseUrl: url!,
        authUrl: "http://localhost:3000",
        authSecret: "m7-test-secret-at-least-thirty-two-characters",
        tokenPepper: "m7-test-token-pepper-sixteen",
      });
      await core.subscribeChanges((event) => {
        changes.push(event);
      });
    });
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());
    afterAll(async () => {
      if (core) await core.close();
      if (connection) await connection.close();
    });
    async function fixture() {
      const signup = await core.auth.api.signUpEmail({
        body: {
          name: "Digest recipient",
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
      const id = signup.user.id,
        p = userPrincipal(id),
        me = await core.getMe(id),
        w = me.workspaces[0].id,
        memberId = me.workspaces[0].memberId;
      return { id, p, w, memberId };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const actor = (
      tx: Parameters<
        Parameters<ReturnType<typeof connectDatabase>["db"]["transaction"]>[0]
      >[0],
      id: string,
    ) => tx.execute(sql`select set_config('taff.actor_id',${id},true)`);
    async function due(
      f: Fixture,
      at = "2026-10-09T09:00:00Z",
    ): Promise<DigestJob> {
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        await tx
          .update(notificationPreferences)
          .set({ nextDigestAt: new Date(at) })
          .where(eq(notificationPreferences.id, f.id));
      });
      const pref = await core.getNotificationPreferences(f.p);
      return {
        userId: f.id,
        scheduledAt: new Date(at).toISOString(),
        preferenceVersion: pref.version,
      };
    }
    const generate = (j: DigestJob) =>
      core.generateDailyDigest(j.userId, j.scheduledAt, j.preferenceVersion);
    it("signup provisions exact preferences atomically and exposes actual membership role", async () => {
      const f = await fixture();
      expect(await core.getNotificationPreferences(f.p)).toEqual(
        DEFAULT_NOTIFICATION_PREFERENCES,
      );
      expect((await core.getMe(f.id)).workspaces[0].role).toBe("admin");
      const rows = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.resourceId, f.id),
            eq(activity.action, "notification_preferences.insert"),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].details).toEqual({});
      await vi.waitFor(() =>
        expect(
          changes.filter(
            (e) =>
              e.resourceId === f.id &&
              e.action === "notification_preferences.insert",
          )[0],
        ).toMatchObject({
          userId: f.id,
          workspaceId: null,
          recipientOnly: true,
        }),
      );
    });
    it("preferences optimistic concurrency has one winner; guests are self-human and agents cannot edit", async () => {
      const f = await fixture();
      const base = await core.getNotificationPreferences(f.p);
      const results = await Promise.allSettled([
        core.updateNotificationPreferences(f.p, { ...base, quiet: true }),
        core.updateNotificationPreferences(f.p, { ...base, review: false }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results)
        if (result.status === "rejected")
          expect(result.reason).toMatchObject({ code: "conflict" });
      expect((await core.getNotificationPreferences(f.p)).version).toBe(2);
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        await tx
          .update(members)
          .set({ role: "guest" })
          .where(eq(members.id, f.memberId));
      });
      expect(
        (
          await core.updateNotificationPreferences(f.p, {
            ...(await core.getNotificationPreferences(f.p)),
            quiet: true,
          })
        ).version,
      ).toBe(3);
      await expect(
        core.getNotificationPreferences({
          kind: "agent",
          memberId: f.memberId,
          workspaceId: f.w,
          tokenId: randomUUID(),
          scopes: [],
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
    it("concurrent/retried jobs create exactly one workspace/day digest and durable Inbox delivery", async () => {
      const f = await fixture(),
        job = await due(f);
      const result = await Promise.all([generate(job), generate(job)]);
      expect(result.map((r) => r.status).sort()).toEqual([
        "generated",
        "skipped",
      ]);
      const generated = result.find((r) => r.status === "generated")!;
      expect(generated.digestIds).toHaveLength(1);
      expect(await generate(job)).toEqual({ status: "skipped", digestIds: [] });
      const digest = await core.getDailyDigest(f.p, generated.digestIds[0]);
      expect(dailyDigestSchema.safeParse(digest).success).toBe(true);
      expect(digest).toMatchObject({
        userId: f.id,
        workspaceId: f.w,
        memberId: f.memberId,
        localDate: "2026-10-09",
        timeZone: "UTC",
      });
      const inbox = await core.listInbox(f.p, f.w, { tab: "all" });
      expect(inbox.items.filter((i) => i.kind === "digest")).toHaveLength(1);
      expect(inbox.items[0].digestId).toBe(digest.id);
      const replay = await due(f, "2026-10-09T10:00:00Z");
      expect(await generate(replay)).toEqual({
        status: "skipped",
        digestIds: [],
      });
      expect((await core.listDailyDigests(f.p, f.w)).items).toHaveLength(1);
      const rows = await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, digest.id));
      expect(rows.map((r) => [r.action, r.actorId, r.details])).toEqual([
        ["daily_digests.insert", "system:daily-digest", {}],
      ]);
      await vi.waitFor(() => {
        expect(changes.find((e) => e.resourceId === digest.id)).toMatchObject({
          recipientOnly: true,
          userId: f.id,
          workspaceId: f.w,
          action: "daily_digests.insert",
        });
        const item = inbox.items[0];
        expect(changes.find((e) => e.resourceId === item.id)).toMatchObject({
          recipientOnly: true,
          userId: f.id,
          action: "inbox_items.insert",
        });
      });
    });
    it("disabled/stale-version/rescheduled markers cannot generate; early jobs move to local slot", async () => {
      const f = await fixture(),
        job = await due(f);
      await core.updateNotificationPreferences(f.p, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        digest: false,
      });
      expect(await generate(job)).toEqual({ status: "skipped", digestIds: [] });
      await core.updateNotificationPreferences(f.p, {
        ...(await core.getNotificationPreferences(f.p)),
        digest: true,
      });
      const fresh = await due(f);
      expect(await generate({ ...fresh, preferenceVersion: 1 })).toEqual({
        status: "skipped",
        digestIds: [],
      });
      expect(
        await generate({ ...fresh, scheduledAt: "2026-10-09T08:00:00Z" }),
      ).toEqual({ status: "skipped", digestIds: [] });
      vi.setSystemTime(new Date("2026-10-09T08:59:59Z"));
      const early = await due(f, "2026-10-09T08:00:00Z");
      expect(await generate(early)).toEqual({
        status: "skipped",
        digestIds: [],
      });
      const [pref] = await connection.db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, f.id));
      expect(pref.nextDigestAt.toISOString()).toBe("2026-10-09T09:00:00.000Z");
      expect((await core.listDailyDigests(f.p, f.w)).items).toEqual([]);
    });
    it("profile timezone changes atomically reschedule outstanding jobs without changing preference version", async () => {
      const f = await fixture(),
        job = await due(f);
      await core.updateProfile(f.id, { locale: "zh-HK", tz: "+0800" });
      expect(await generate(job)).toEqual({ status: "skipped", digestIds: [] });
      const [pref] = await connection.db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, f.id));
      expect(pref.version).toBe(1);
      expect(pref.nextDigestAt.toISOString()).toBe("2026-10-10T01:00:00.000Z");
      const next = await due(f);
      const result = await generate(next);
      expect(
        (await core.getDailyDigest(f.p, result.digestIds[0])).timeZone,
      ).toBe("+08:00");
      expect((await core.getDailyDigest(f.p, result.digestIds[0])).locale).toBe(
        "zh-HK",
      );
    });
    it("latest local day only is generated after downtime, one per authorized workspace; recipient isolation holds", async () => {
      const f = await fixture(),
        other = await fixture();
      const extra = await core.createWorkspace(f.p, {
        name: "Digest second organization",
      });
      const job = await due(f, "2026-09-01T09:00:00Z");
      const result = await generate(job);
      expect(result.digestIds).toHaveLength(2);
      for (const id of result.digestIds) {
        const row = await core.getDailyDigest(f.p, id);
        expect(row.localDate).toBe("2026-10-09");
        await expect(core.getDailyDigest(other.p, id)).rejects.toMatchObject({
          code: "not_found",
        });
      }
      await expect(
        core.listDailyDigests(other.p, extra.id),
      ).rejects.toMatchObject({ code: "forbidden" });
      const [foreign] = await core
        .listDailyDigests(f.p, extra.id)
        .then((r) => r.items);
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        await tx
          .delete(inboxItems)
          .where(eq(inboxItems.memberId, extra.memberId));
        await tx.delete(members).where(eq(members.id, extra.memberId));
      });
      await expect(core.getDailyDigest(f.p, foreign.id)).rejects.toMatchObject({
        code: "not_found",
      });
      const again = await due(f, "2026-10-09T11:00:00Z");
      expect(await generate(again)).toEqual({
        status: "skipped",
        digestIds: [],
      });
    });
    it("snapshots include real task/review/run events and metrics, exclude output and cap per-category data", async () => {
      const f = await fixture();
      let agentId: string = "";
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        const [agent] = await tx
          .insert(members)
          .values({
            workspaceId: f.w,
            name: "Real Digest Agent",
            kind: "agent",
          })
          .returning();
        agentId = agent.id;
      });
      const task = await core.createTask(f.p, {
        workspaceId: f.w,
        ownerId: f.memberId,
        workerId: agentId,
        title: "Actual review",
        dueAt: "2026-10-09T10:00:00Z",
      });
      let run = await core.startRun(f.p, task.id, {});
      await core.appendRunEvent(f.p, run.id, {
        version: run.version,
        kind: "step",
        title: "Executed step",
        text: "private event content",
        durationMs: 321,
        costMicros: 456,
        sourceUrl: null,
        testStatus: null,
      });
      run = (await core.getRun(f.p, run.id)).run;
      await core.attachRunArtifact(f.p, run.id, {
        version: run.version,
        diff: null,
        sourceUrl: null,
        name: "result.txt",
        mimeType: "text/plain",
        content: "private output never in digest",
      });
      run = (await core.getRun(f.p, run.id)).run;
      run = await core.submitRun(f.p, run.id, {
        requestReview: true,
        version: run.version,
        summary: "Actual output ready",
      });
      await core.updateNotificationPreferences(f.p, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        review: false,
        block: false,
        mention: false,
        done: false,
      });
      expect(
        (await core.listInbox(f.p, f.w, { tab: "reviews" })).items,
      ).toHaveLength(1);
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        await tx.insert(tasks).values(
          Array.from({ length: 24 }, () => ({
            workspaceId: f.w,
            ownerId: f.memberId,
            title: "Today due",
            dueAt: new Date("2026-10-09T15:00:00Z"),
          })),
        );
      });
      const result = await generate(await due(f));
      const row = await core.getDailyDigest(f.p, result.digestIds[0]);
      expect(row.snapshot.reviews).toEqual({
        count: 1,
        items: [{ taskId: task.id, title: "Actual review", runId: run.id }],
      });
      expect(row.snapshot.dueToday.count).toBe(25);
      expect(row.snapshot.dueToday.items).toHaveLength(20);
      expect(row.snapshot.truncated).toBe(true);
      expect(row.snapshot.agents.items[0]).toMatchObject({
        runId: run.id,
        agentId,
        status: "needs_review",
        eventCount: 1,
        durationMs: 321,
        costMicros: 456,
      });
      expect(row.snapshot.agents.items[0].lastEventAt).not.toBeNull();
      expect(JSON.stringify(row)).not.toContain("private output");
      expect(JSON.stringify(row)).not.toContain("private event content");
      expect(
        dailyDigestListSchema.safeParse(await core.listDailyDigests(f.p, f.w))
          .success,
      ).toBe(true);
    });
    it("genuine auto-approved completion produces done Inbox even with foreground category off", async () => {
      const f = await fixture();
      let agentId: string = "";
      await connection.db.transaction(async (tx) => {
        await actor(tx, f.id);
        const [row] = await tx
          .insert(members)
          .values({
            workspaceId: f.w,
            name: "Auto-approved agent",
            kind: "agent",
          })
          .returning();
        agentId = row.id;
      });
      await core.updateAgentProfile(f.p, agentId, {
        supervisorId: f.memberId,
        reviewPolicy: "ask_only",
        maxDurationMs: null,
        maxCostMicros: null,
      });
      await core.updateNotificationPreferences(f.p, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        done: false,
      });
      const task = await core.createTask(f.p, {
        workspaceId: f.w,
        ownerId: f.memberId,
        workerId: agentId,
        title: "Actual completed output",
      });
      let run = await core.startRun(f.p, task.id, {});
      await core.attachRunArtifact(f.p, run.id, {
        version: run.version,
        name: "actual.txt",
        mimeType: "text/plain",
        content: "Actual caller output",
        diff: null,
        sourceUrl: null,
      });
      run = (await core.getRun(f.p, run.id)).run;
      run = await core.submitRun(f.p, run.id, {
        version: run.version,
        summary: "Actual completion",
        requestReview: false,
      });
      expect(run.status).toBe("completed");
      const items = (await core.listInbox(f.p, f.w, { tab: "all" })).items;
      expect(items).toContainEqual(
        expect.objectContaining({
          kind: "done",
          taskId: task.id,
          runId: run.id,
          digestId: null,
        }),
      );
      const result = await generate(await due(f));
      expect(
        (await core.getDailyDigest(f.p, result.digestIds[0])).snapshot.agents
          .items,
      ).toContainEqual(
        expect.objectContaining({
          runId: run.id,
          status: "completed",
          eventCount: 0,
          durationMs: 0,
          costMicros: 0,
        }),
      );
    });
    it("digest history stays bounded and reports truncation", async () => {
      const f = await fixture();
      const day = new Date("2026-09-01T12:00:00Z");
      for (let i = 0; i < 32; i++) {
        vi.setSystemTime(day);
        const marker = new Date(day.getTime() - 3 * 3600000).toISOString();
        expect((await generate(await due(f, marker))).status).toBe("generated");
        day.setUTCDate(day.getUTCDate() + 1);
      }
      const list = await core.listDailyDigests(f.p, f.w);
      expect(list.items).toHaveLength(31);
      expect(list.truncated).toBe(true);
      expect(list.items[0].localDate).toBe("2026-10-02");
      expect(list.items.at(-1)?.localDate).toBe("2026-09-02");
    });
    it.each([
      [
        "+08:00",
        "2026-10-09T12:00:00Z",
        "2026-10-08T16:00:00Z",
        "2026-10-08T15:59:59Z",
      ],
      [
        "America/Havana",
        "2026-03-08T13:00:00Z",
        "2026-03-08T05:00:00Z",
        "2026-03-08T04:59:59Z",
      ],
    ])(
      "dueToday respects saved local date including offset sign and missing midnight %s",
      async (zone, clock, inDay, offDay) => {
        const f = await fixture();
        vi.setSystemTime(new Date(clock));
        await core.updateProfile(f.id, { locale: "en", tz: zone });
        const yes = await core.createTask(f.p, {
          workspaceId: f.w,
          ownerId: f.memberId,
          workerId: null,
          title: "Local date match",
          dueAt: inDay,
        });
        await core.createTask(f.p, {
          workspaceId: f.w,
          ownerId: f.memberId,
          workerId: null,
          title: "Previous local date",
          dueAt: offDay,
        });
        const result = await generate(
          await due(f, new Date(Date.parse(clock) - 1000).toISOString()),
        );
        const row = await core.getDailyDigest(f.p, result.digestIds[0]);
        expect(row.snapshot.dueToday.count).toBe(1);
        expect(row.snapshot.dueToday.items[0].taskId).toBe(yes.id);
      },
    );
    it("generator failure rolls back snapshot, Inbox, next marker, audit and notifications; retry succeeds", async () => {
      const f = await fixture(),
        job = await due(f);
      const functionName = "taff_m7_test_reject_digest";
      await connection.client.unsafe(
        `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M7 test rollback'; END; $$`,
      );
      await connection.client.unsafe(
        `CREATE TRIGGER ${functionName} BEFORE INSERT ON inbox_items FOR EACH ROW WHEN (NEW.member_id='${f.memberId}'::uuid AND NEW.kind='digest') EXECUTE FUNCTION ${functionName}()`,
      );
      try {
        await expect(generate(job)).rejects.toThrow();
        expect(
          await connection.db
            .select()
            .from(dailyDigests)
            .where(eq(dailyDigests.userId, f.id)),
        ).toEqual([]);
        expect((await core.listInbox(f.p, f.w, { tab: "all" })).items).toEqual(
          [],
        );
        const [pref] = await connection.db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.id, f.id));
        expect(pref.nextDigestAt.toISOString()).toBe(job.scheduledAt);
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(
          changes.filter(
            (e) => e.userId === f.id && e.action === "daily_digests.insert",
          ),
        ).toEqual([]);
        const audit = await connection.db
          .select()
          .from(activity)
          .where(
            and(
              eq(activity.workspaceId, f.w),
              eq(activity.action, "daily_digests.insert"),
            ),
          );
        expect(audit).toEqual([]);
      } finally {
        await connection.client.unsafe(
          `DROP TRIGGER ${functionName} ON inbox_items`,
        );
        await connection.client.unsafe(`DROP FUNCTION ${functionName}()`);
      }
      expect((await generate(job)).status).toBe("generated");
    });
    it("a job blocked across local midnight uses the clock after row locks", async () => {
      const f = await fixture();
      vi.setSystemTime(new Date("2026-10-09T23:59:59Z"));
      const job = await due(f);
      let locked!: () => void;
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      let release!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = connection.db.transaction(async (tx) => {
        await tx.select().from(user).where(eq(user.id, f.id)).for("update");
        locked();
        await hold;
      });
      await acquired;
      const result = generate(job);
      try {
        await vi.waitFor(async () => {
          const [row] =
            await connection.client`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%from "users"%for update%'`;
          expect(row.n).toBeGreaterThan(0);
        });
        vi.setSystemTime(new Date("2026-10-10T00:01:00Z"));
      } finally {
        release();
        await blocker;
      }
      expect(await result).toEqual({ status: "skipped", digestIds: [] });
      expect((await core.listDailyDigests(f.p, f.w)).items).toEqual([]);
      const [pref] = await connection.db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, f.id));
      expect(pref.nextDigestAt.toISOString()).toBe("2026-10-10T09:00:00.000Z");
    });
    it.skipIf(!(process.env.TEST_REDIS_URL ?? process.env.REDIS_URL))(
      "real BullMQ retries after commit produce one persisted digest and one Inbox item",
      async () => {
        const f = await fixture(),
          data = await due(f);
        const workerRequire = createRequire(
          new URL("../../../apps/worker/package.json", import.meta.url),
        );
        const { Queue, Worker, QueueEvents } = workerRequire(
          "bullmq",
        ) as typeof import("../../../apps/worker/node_modules/bullmq");
        const redisUrl = new URL(
          (process.env.TEST_REDIS_URL ?? process.env.REDIS_URL)!,
        );
        const connectionOptions = {
          host: redisUrl.hostname,
          port: Number(redisUrl.port || 6379),
          username: redisUrl.username
            ? decodeURIComponent(redisUrl.username)
            : undefined,
          password: redisUrl.password
            ? decodeURIComponent(redisUrl.password)
            : undefined,
          db: Number(redisUrl.pathname.slice(1) || 0),
          tls: redisUrl.protocol === "rediss:" ? {} : undefined,
          maxRetriesPerRequest: null,
        };
        const name = `taff-digest-test-${randomUUID()}`;
        const queue = new Queue(name, { connection: connectionOptions });
        const events = new QueueEvents(name, { connection: connectionOptions });
        const processor = createDigestProcessor(core, queue);
        let failAfterCommit = true;
        let attempts = 0;
        const worker = new Worker(
          name,
          async (job) => {
            attempts++;
            const result = await processor(job);
            if (failAfterCommit) {
              failAfterCommit = false;
              throw new Error(
                "test crash after DB commit before queue acknowledgment",
              );
            }
            return result;
          },
          { connection: connectionOptions, autorun: false },
        );
        try {
          await Promise.all([
            queue.waitUntilReady(),
            events.waitUntilReady(),
            worker.waitUntilReady(),
          ]);
          const job = await queue.add("daily-digest", data, {
            jobId: randomUUID(),
            attempts: 2,
          });
          const done = job.waitUntilFinished(events, 10000);
          void worker.run();
          expect(await done).toEqual({ status: "skipped", digestIds: [] });
          expect(attempts).toBe(2);
          const rows = await core.listDailyDigests(f.p, f.w);
          expect(rows.items).toHaveLength(1);
          const inbox = (
            await core.listInbox(f.p, f.w, { tab: "all" })
          ).items.filter((item) => item.kind === "digest");
          expect(inbox).toHaveLength(1);
          expect(inbox[0].digestId).toBe(rows.items[0].id);
        } finally {
          await worker.close();
          await events.close();
          await queue.obliterate({ force: true });
          await queue.close();
        }
      },
      15000,
    );
    it("scanner keyset pagination reaches later due rows and skips disabled settings", async () => {
      const fixtures = await Promise.all([fixture(), fixture(), fixture()]);
      for (const f of fixtures) await due(f);
      let cursor: Parameters<Core["listDueDigestJobs"]>[2];
      const found = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        const page = await core.listDueDigestJobs(
          "2026-10-09T12:00:00Z",
          2,
          cursor,
        );
        for (const job of page.jobs) found.add(job.userId);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      expect(fixtures.every((f) => found.has(f.id))).toBe(true);
      const f = fixtures[0];
      await core.updateNotificationPreferences(f.p, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        digest: false,
      });
      const page = await core.listDueDigestJobs("2026-10-10T12:00:00Z", 500, {
        scheduledAt: "2026-10-09T08:59:59Z",
        userId: "!",
      });
      expect(page.jobs.some((j) => j.userId === f.id)).toBe(false);
      await expect(core.listDueDigestJobs("invalid", 1)).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(
        core.listDueDigestJobs("2026-10-09T12:00:00Z", 501),
      ).rejects.toMatchObject({ code: "invalid_input" });
    });
  },
);
