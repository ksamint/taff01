import { randomUUID } from "node:crypto";
import {
  activity,
  audienceRecipients,
  connectDatabase,
  dailySummaries,
  members,
  summaryRenders,
} from "@taff/db";
import {
  dailySummaryListSchema,
  dailySummarySchema,
  dailySummarySnapshotSchema,
  sharedSummarySchema,
  summaryRenderSchema,
  summaryShareSchema,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";
import { summaryContentHash, summaryWatermark } from "./summary-model";

/*
 * ADR 0027 shareholder summaries against PostgreSQL. The access matrix
 * follows AGENTS.md: every operation that issues, lists, re-enables or
 * revokes access is run by the lowest role that can reach it, by each role
 * that cannot, and again after the role that could has lost its authority.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn("SKIP summary PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Summary tests require an isolated _test database");

const DAY = 86_400_000;
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=";
describe.skipIf(!url)("shareholder daily summaries (ADR 0027)", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let offset = 0;
  let alice: Principal, bob: Principal, gina: Principal, outsider: Principal;
  let agent: Principal;
  let aliceId: string, ginaId: string, outsiderId: string;
  let w: string, otherW: string, owner: string, bobMember: string;

  const forbidden = { code: "forbidden" };
  const notFound = { code: "not_found" };
  const refused = async (run: () => Promise<unknown>, code = forbidden) =>
    expect(run()).rejects.toMatchObject(code);
  const asActor = (id: string) =>
    connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${id},true)`);
      return tx;
    });

  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "summary-test-secret-longer-than-thirty-two",
      tokenPepper: "summary-test-pepper-sixteen",
      summaryClock: () => new Date(Date.now() + offset),
    });
    const signup = (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Alex Admin");
    aliceId = a.user.id;
    alice = userPrincipal(aliceId);
    const me = await core.getMe(aliceId);
    w = me.workspaces[0].id;
    owner = me.workspaces[0].memberId;
    const b = await signup("Bob Member");
    bob = userPrincipal(b.user.id);
    const g = await signup("Gina Shareholder");
    ginaId = g.user.id;
    gina = userPrincipal(ginaId);
    const o = await signup("Oscar Outsider");
    outsiderId = o.user.id;
    outsider = userPrincipal(outsiderId);
    otherW = (await core.getMe(outsiderId)).workspaces[0].id;
    let agentMember = "";
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${aliceId},true)`);
      const [bm] = await tx
        .insert(members)
        .values([
          {
            workspaceId: w,
            userId: b.user.id,
            name: "Bob Member",
            kind: "person",
          },
          {
            workspaceId: w,
            userId: ginaId,
            name: "Gina Shareholder",
            kind: "person",
            role: "guest",
          },
        ])
        .returning();
      bobMember = bm.id;
      const [ag] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "Summary Agent", kind: "agent" })
        .returning();
      agentMember = ag.id;
    });
    agent = (await core.authenticateAgentToken(
      (
        await core.createAgentToken(alice, {
          workspaceId: w,
          memberId: agentMember,
          name: "summary agent",
          scopes: ["tasks:read", "tasks:write"],
        })
      ).token,
    ))!;
  }, 60000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  /** Makes the recipient due now and runs its job. */
  async function runDue(recipientId: string) {
    const due = new Date(Date.now() + offset - 60_000);
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${aliceId},true)`);
      await tx
        .update(audienceRecipients)
        .set({ nextDueAt: due })
        .where(eq(audienceRecipients.id, recipientId));
    });
    const now = new Date(Date.now() + offset).toISOString();
    const jobs = [];
    let cursor: Parameters<Core["listDueSummaryJobs"]>[2];
    do {
      const page = await core.listDueSummaryJobs(now, 100, cursor);
      jobs.push(...page.jobs);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const job = jobs.find((j) => j.recipientId === recipientId);
    expect(job).toBeDefined();
    return {
      job: job!,
      result: await core.generateDailySummary(
        job!.recipientId,
        job!.scheduledAt,
        job!.version,
      ),
    };
  }
  /** Generates every recipient's summary at "deliverAt 00:00", always due. */
  async function setup(org: string) {
    const tag = await core.createAudienceTag(alice, w, { org });
    const project = await core.createProject(alice, w, {
      name: `${org} project`,
    });
    await core.createTask(alice, {
      workspaceId: w,
      ownerId: owner,
      workerId: null,
      title: `${org} first task`,
      projectId: project.id,
    });
    await core.setProjectAudienceTags(alice, project.id, { tagIds: [tag.id] });
    const recipient = await core.createAudienceRecipient(alice, tag.id, {
      name: "Gina Shareholder",
      userId: ginaId,
      locale: "en",
      timeZone: "UTC",
      deliverAt: "00:00",
    });
    const { result } = await runDue(recipient.id);
    expect(result.status).toBe("generated");
    return { tag, project, recipient, summaryId: result.summaryId! };
  }

  it("lets admins manage audiences and members read tags; refuses guests, agents and outsiders", async () => {
    const tag = await core.createAudienceTag(alice, w, {
      org: "Harbour Capital",
      label: "Series A",
    });
    expect(tag).toMatchObject({
      kind: "shareholder",
      org: "Harbour Capital",
      label: "Series A",
      archived: false,
      version: 1,
      projectCount: 0,
      recipientCount: 0,
    });
    await refused(
      () => core.createAudienceTag(alice, w, { org: "harbour capital" }),
      {
        code: "conflict",
      },
    );
    for (const who of [bob, gina, agent, outsider])
      await refused(() => core.createAudienceTag(who, w, { org: "Nope" }));
    expect((await core.listAudienceTags(bob, w)).map((t) => t.id)).toContain(
      tag.id,
    );
    for (const who of [gina, agent, outsider])
      await refused(() => core.listAudienceTags(who, w));

    const project = await core.createProject(alice, w, { name: "Tagged" });
    for (const who of [bob, gina, agent, outsider])
      await refused(() =>
        core.setProjectAudienceTags(who, project.id, { tagIds: [tag.id] }),
      );
    const theirs = await core.createAudienceTag(outsider, otherW, {
      org: "Elsewhere",
    });
    await refused(
      () =>
        core.setProjectAudienceTags(alice, project.id, { tagIds: [theirs.id] }),
      { code: "invalid_input" },
    );
    expect(
      await core.setProjectAudienceTags(alice, project.id, {
        tagIds: [tag.id],
      }),
    ).toEqual({
      projectId: project.id,
      tags: [
        {
          id: tag.id,
          kind: "shareholder",
          org: "Harbour Capital",
          label: "Series A",
        },
      ],
    });
    expect(
      (await core.listProjectAudienceTags(bob, project.id)).tags,
    ).toHaveLength(1);
    await refused(() => core.listProjectAudienceTags(gina, project.id));
    expect(
      (await core.setProjectAudienceTags(alice, project.id, { tagIds: [] }))
        .tags,
    ).toEqual([]);

    const recipient = await core.createAudienceRecipient(alice, tag.id, {
      name: "Gina Shareholder",
      userId: ginaId,
      locale: "zh-HK",
      timeZone: "Asia/Hong_Kong",
      deliverAt: "18:00",
    });
    expect(recipient).toMatchObject({
      includeFinance: false,
      showPeople: true,
      enabled: true,
      userId: ginaId,
    });
    await refused(
      () =>
        core.createAudienceRecipient(alice, tag.id, {
          name: "Again",
          userId: ginaId,
          locale: "en",
          timeZone: "UTC",
          deliverAt: "09:00",
        }),
      { code: "conflict" },
    );
    await refused(
      () =>
        core.createAudienceRecipient(alice, tag.id, {
          name: "Not a member",
          userId: outsiderId,
          locale: "en",
          timeZone: "UTC",
          deliverAt: "09:00",
        }),
      { code: "invalid_input" },
    );
    for (const who of [bob, gina, agent, outsider]) {
      await refused(() => core.listAudienceRecipients(who, tag.id));
      await refused(() =>
        core.createAudienceRecipient(who, tag.id, {
          name: "x",
          locale: "en",
          timeZone: "UTC",
          deliverAt: "09:00",
        }),
      );
      await refused(() =>
        core.updateAudienceRecipient(who, recipient.id, {
          version: recipient.version,
          enabled: false,
        }),
      );
      await refused(() =>
        core.updateAudienceTag(who, tag.id, {
          version: tag.version,
          archived: true,
        }),
      );
    }
    await refused(
      () => core.updateAudienceTag(alice, tag.id, { version: 99, label: "x" }),
      { code: "conflict" },
    );
    const audits = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, tag.id),
          eq(activity.action, "audience_tags.insert"),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(aliceId);
    expect(audits[0].details).toEqual({});
  });

  it("generates one immutable, watermarked summary per recipient day with the timeline's risk", async () => {
    const { project, recipient, summaryId } = await setup("Kowloon Ventures");
    const summary = dailySummarySchema.parse(
      await core.getDailySummary(alice, summaryId),
    );
    expect(summary.snapshot.tag.org).toBe("Kowloon Ventures");
    expect(summary.snapshot.recipient.name).toBe("Gina Shareholder");
    const [line] = summary.snapshot.projects;
    expect(line.projectId).toBe(project.id);
    expect(line.counts).toMatchObject({ total: 1, open: 1, movedToday: 1 });
    expect(line.finance).toBeNull();
    const timeline = await core.getTimeline(alice, project.id);
    expect(line.risk).toEqual({
      level: timeline.risk.level,
      reasons: timeline.risk.reasons,
      plannedEnd: timeline.risk.plannedEnd,
      forecastEnd: timeline.risk.forecastEnd,
      slipDays: timeline.risk.slipDays,
      deliveryPercent: timeline.risk.deliveryPercent,
    });
    expect(summary.watermark).toMatchObject({
      recipientName: "Gina Shareholder",
      org: "Kowloon Ventures",
      summaryId,
      contentHash: summary.contentHash,
    });
    expect(summary.watermark.text).toBe(
      `Gina Shareholder · Kowloon Ventures · ${summary.localDate} · ${summaryId.slice(0, 8)}`,
    );

    // A retried or duplicate job on the same day is harmless.
    const again = await runDue(recipient.id);
    expect(again.result).toEqual({ status: "skipped", summaryId: null });
    expect(
      await core.generateDailySummary(
        again.job.recipientId,
        again.job.scheduledAt,
        again.job.version,
      ),
    ).toEqual({ status: "skipped", summaryId: null });
    const rows = await connection.db
      .select()
      .from(dailySummaries)
      .where(eq(dailySummaries.recipientId, recipient.id));
    expect(rows).toHaveLength(1);

    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${aliceId},true)`,
        );
        await tx
          .update(dailySummaries)
          .set({ locale: "zh-CN" })
          .where(eq(dailySummaries.id, summaryId));
      }),
    ).rejects.toThrow();

    // Finance appears only through the recipient's switch.
    const finance = await core.updateAudienceRecipient(alice, recipient.id, {
      version: recipient.version,
      includeFinance: true,
    });
    const preview = await core.previewDailySummary(alice, {
      recipientId: finance.id,
    });
    expect(preview.watermark.summaryId).toBeNull();
    expect(preview.watermark.text).toMatch(/ · preview$/);
    expect(preview.snapshot.projects[0].finance).not.toBeNull();
    for (const who of [bob, gina, agent, outsider])
      await refused(() =>
        core.previewDailySummary(who, { recipientId: recipient.id }),
      );
  });

  it("lets admins and the linked recipient read summaries, and nobody else", async () => {
    const { tag, recipient, summaryId } = await setup("Lantau Partners");
    expect((await core.getDailySummary(gina, summaryId)).id).toBe(summaryId);
    for (const who of [bob, agent, outsider])
      await refused(() => core.getDailySummary(who, summaryId));
    const mine = dailySummaryListSchema.parse(
      await core.listDailySummaries(gina, w),
    );
    expect(mine.items.map((s) => s.id)).toContain(summaryId);
    expect(
      (await core.listDailySummaries(alice, w, { tagId: tag.id })).items.map(
        (s) => s.id,
      ),
    ).toEqual([summaryId]);
    await refused(() => core.listDailySummaries(agent, w));
    await refused(() => core.listDailySummaries(outsider, w));
    expect((await core.listDailySummaries(bob, w)).items).toEqual([]);

    // Unlinking the account ends in-app reading at once.
    await core.updateAudienceRecipient(alice, recipient.id, {
      version: recipient.version,
      userId: null,
    });
    await refused(() => core.getDailySummary(gina, summaryId));
    expect(
      (await core.listDailySummaries(gina, w)).items.map((s) => s.id),
    ).not.toContain(summaryId);
    expect((await core.getDailySummary(alice, summaryId)).id).toBe(summaryId);
  });

  it("issues, lists, revokes and expires share links; re-enabling follows the admin role", async () => {
    const { tag, recipient, summaryId } = await setup("Victoria Holdings");

    // Issue: admins only.
    for (const who of [bob, gina, agent, outsider])
      await refused(() => core.createSummaryShare(who, summaryId));
    const share = await core.createSummaryShare(alice, summaryId);
    expect(share.token).toMatch(/^tsum_[A-Za-z0-9_-]{43}$/);
    expect(share.status).toBe("active");
    expect(Date.parse(share.expiresAt) - Date.parse(share.createdAt)).toBe(
      7 * DAY,
    );

    // Public read by token; every miss looks the same.
    const shared = sharedSummarySchema.parse(
      await core.readSharedSummary(share.token),
    );
    expect(shared.watermark.summaryId).toBe(summaryId);
    expect(Object.keys(shared)).not.toContain("workspaceId");
    await refused(() => core.readSharedSummary("tsum_short"), notFound);
    await refused(
      () => core.readSharedSummary(`tsum_${"A".repeat(43)}`),
      notFound,
    );

    // List: admins only, never the token.
    for (const who of [bob, gina, agent, outsider])
      await refused(() => core.listSummaryShares(who, summaryId));
    const [listed] = await core.listSummaryShares(alice, summaryId);
    expect(summaryShareSchema.parse(listed)).toMatchObject({
      id: share.id,
      viewCount: 1,
      status: "active",
    });
    expect(Object.keys(listed)).not.toContain("token");
    expect(JSON.stringify(listed)).not.toContain(share.token);

    // Disabling the recipient or archiving the tag cuts every link at once;
    // re-enabling restores unexpired, unrevoked links.
    let current = await core.updateAudienceRecipient(alice, recipient.id, {
      version: recipient.version,
      enabled: false,
    });
    await refused(() => core.readSharedSummary(share.token), notFound);
    current = await core.updateAudienceRecipient(alice, recipient.id, {
      version: current.version,
      enabled: true,
    });
    expect((await core.readSharedSummary(share.token)).contentHash).toBe(
      shared.contentHash,
    );
    let currentTag = await core.updateAudienceTag(alice, tag.id, {
      version: tag.version,
      archived: true,
    });
    await refused(() => core.readSharedSummary(share.token), notFound);
    currentTag = await core.updateAudienceTag(alice, tag.id, {
      version: currentTag.version,
      archived: false,
    });
    await core.readSharedSummary(share.token);

    // Revoke: admins only; immediate and idempotent.
    for (const who of [bob, gina, agent, outsider])
      await refused(() => core.revokeSummaryShare(who, share.id));
    const revoked = await core.revokeSummaryShare(alice, share.id);
    expect(revoked.status).toBe("revoked");
    await refused(() => core.readSharedSummary(share.token), notFound);
    expect((await core.revokeSummaryShare(alice, share.id)).revokedAt).toBe(
      revoked.revokedAt,
    );

    // Expiry.
    const brief = await core.createSummaryShare(alice, summaryId, {
      expiresInDays: 1,
    });
    await core.readSharedSummary(brief.token);
    offset = 2 * DAY;
    try {
      await refused(() => core.readSharedSummary(brief.token), notFound);
      expect(
        (await core.listSummaryShares(alice, summaryId)).find(
          (s) => s.id === brief.id,
        )?.status,
      ).toBe("expired");
    } finally {
      offset = 0;
    }
    await refused(
      () => core.createSummaryShare(alice, summaryId, { expiresInDays: 91 }),
      { code: "invalid_input" },
    );

    // The lowest role that reaches these operations is admin. Promote Bob,
    // let him exercise each one, then demote him and re-run them all.
    await core.updateMemberRole(alice, w, bobMember, { role: "admin" });
    const bobShare = await core.createSummaryShare(bob, summaryId);
    expect((await core.listSummaryShares(bob, summaryId)).length).toBe(3);
    current = await core.updateAudienceRecipient(bob, recipient.id, {
      version: current.version,
      enabled: false,
    });
    current = await core.updateAudienceRecipient(bob, recipient.id, {
      version: current.version,
      enabled: true,
    });
    currentTag = await core.updateAudienceTag(bob, tag.id, {
      version: currentTag.version,
      label: "Bob was here",
    });
    await core.readSharedSummary(bobShare.token);
    await core.updateMemberRole(alice, w, bobMember, { role: "member" });
    await refused(() => core.createSummaryShare(bob, summaryId));
    await refused(() => core.listSummaryShares(bob, summaryId));
    await refused(() => core.revokeSummaryShare(bob, bobShare.id));
    await refused(() =>
      core.updateAudienceRecipient(bob, recipient.id, {
        version: current.version,
        enabled: false,
      }),
    );
    await refused(() =>
      core.updateAudienceTag(bob, tag.id, {
        version: currentTag.version,
        archived: true,
      }),
    );
    await refused(() =>
      core.previewDailySummary(bob, { recipientId: recipient.id }),
    );
    await refused(() => core.getDailySummary(bob, summaryId));
    // Links he issued stay governed by the admin who remains.
    await core.readSharedSummary(bobShare.token);
    await core.revokeSummaryShare(alice, bobShare.id);
    await refused(() => core.readSharedSummary(bobShare.token), notFound);

    const views = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, share.id),
          eq(activity.action, "summary_shares.update"),
        ),
      );
    expect(views.some((row) => row.actorId === "system:summary-share")).toBe(
      true,
    );
    expect(views.every((row) => JSON.stringify(row.details) === "{}")).toBe(
      true,
    );
  });

  it("skips disabled, archived and stale jobs, advancing only the marker", async () => {
    const { tag, recipient } = await setup("Stanley Trust");
    const before = await core.listAudienceRecipients(alice, tag.id);
    const row = before.find((r) => r.id === recipient.id)!;
    await core.updateAudienceTag(alice, tag.id, {
      version: (await core.listAudienceTags(alice, w)).find(
        (t) => t.id === tag.id,
      )!.version,
      archived: true,
    });
    offset = DAY;
    try {
      const { result } = await runDue(row.id);
      expect(result).toEqual({ status: "skipped", summaryId: null });
      const [after] = await connection.db
        .select()
        .from(audienceRecipients)
        .where(eq(audienceRecipients.id, row.id));
      expect(after.nextDueAt.getTime()).toBeGreaterThan(Date.now() + offset);
      expect(
        await core.generateDailySummary(
          row.id,
          new Date().toISOString(),
          row.version,
        ),
      ).toEqual({ status: "skipped", summaryId: null });
    } finally {
      offset = 0;
    }
    await refused(
      () =>
        core.createAudienceRecipient(alice, tag.id, {
          name: "Too late",
          locale: "en",
          timeZone: "UTC",
          deliverAt: "09:00",
        }),
      { code: "conflict" },
    );
    expect(
      await core.listDueSummaryJobs(new Date().toISOString(), 1),
    ).toMatchObject({ jobs: expect.any(Array) });
    await refused(() => core.listDueSummaryJobs("not-a-date"), {
      code: "invalid_input",
    });
  });
  it("stores both immutable render formats idempotently and applies summary and public-share authorization", async () => {
    const { summaryId } = await setup("Render recipient");
    const source = await core.getSummaryForRender(summaryId);
    const body = `${source.watermark.text}\n${source.contentHash}`;
    const text = summaryRenderSchema.parse(
      await core.storeSummaryRender({
        summaryId,
        format: "txt",
        body,
        rendererVersion: "test-v1",
      }),
    );
    expect(text).toMatchObject({
      body,
      data: null,
      byteSize: Buffer.byteLength(body),
      contentHash: source.contentHash,
    });
    expect(
      await core.storeSummaryRender({
        summaryId,
        format: "txt",
        body: "ignored duplicate",
        rendererVersion: "test-v2",
      }),
    ).toEqual(text);
    const data = PNG;
    const png = await core.storeSummaryRender({
      summaryId,
      format: "png",
      data,
      rendererVersion: "test-v1",
    });
    expect(png.data).toBe(data);
    expect(png.body).toBeNull();
    expect(await core.getSummaryRender(gina, summaryId, "txt")).toEqual(text);
    for (const p of [bob, outsider, agent])
      await refused(() => core.getSummaryRender(p, summaryId, "png"));
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${aliceId},true)`,
        );
        await tx
          .update(summaryRenders)
          .set({ body: "tamper" })
          .where(eq(summaryRenders.id, text.id));
      }),
    ).rejects.toThrow();
    const share = await core.createSummaryShare(alice, summaryId);
    const shared = await core.getSharedSummaryRender(share.token, "png");
    expect(shared.data).toBe(data);
    expect(shared).not.toHaveProperty("summaryId");
    expect(shared).not.toHaveProperty("workspaceId");
    await core.revokeSummaryShare(alice, share.id);
    await refused(
      () => core.getSharedSummaryRender(share.token, "png"),
      notFound,
    );
    await refused(
      () => core.getSharedSummaryRender("unknown", "txt"),
      notFound,
    );
    await core.recordSummaryRenderFailure(summaryId, "png");
    const [failure] = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, summaryId),
          eq(activity.action, "summary.render_failed"),
        ),
      );
    expect(failure.details).toEqual({ format: "png" });
  });
  it("validates render payloads and allows only the current summaries:read agent scope", async () => {
    const { summaryId } = await setup("Scoped render recipient");
    for (const input of [
      {
        summaryId,
        format: "txt",
        body: "x".repeat(4001),
        rendererVersion: "v1",
      },
      {
        summaryId,
        format: "png",
        data: Buffer.from("not png").toString("base64"),
        rendererVersion: "v1",
      },
      {
        summaryId,
        format: "txt",
        body: "text",
        data: "cG5n",
        rendererVersion: "v1",
      },
    ] as const)
      await expect(core.storeSummaryRender(input)).rejects.toThrow();
    if (agent.kind !== "agent") throw new Error("agent fixture required");
    const issued = await core.createAgentToken(alice, {
      workspaceId: w,
      memberId: agent.memberId,
      name: "summary-only reader",
      scopes: ["summaries:read"],
    });
    const reader = (await core.authenticateAgentToken(issued.token))!;
    expect((await core.getDailySummary(reader, summaryId)).id).toBe(summaryId);
    expect(
      (await core.listDailySummaries(reader, w)).items.map((s) => s.id),
    ).toContain(summaryId);
    await refused(async () =>
      core.previewDailySummary(reader, {
        recipientId: (await core.getDailySummary(alice, summaryId)).recipientId,
      }),
    );
    await refused(() => core.createSummaryShare(reader, summaryId));
    await refused(() => core.listAudienceTags(reader, w));
    await core.setAgentTokenWorkspace(alice, issued.id, {
      workspaceId: w,
      memberId: agent.memberId,
      scopes: ["summaries:read"],
      revoked: true,
    });
    await refused(() => core.getDailySummary(reader, summaryId));
    await refused(() => core.listDailySummaries(reader, w));
    await core.setAgentTokenWorkspace(alice, issued.id, {
      workspaceId: w,
      memberId: agent.memberId,
      scopes: ["tasks:read"],
    });
    await refused(() => core.getDailySummary(reader, summaryId));
  });
  it("scans missing render formats and retries failures in an isolated age window", async () => {
    const { summaryId: sourceId } = await setup("Render scan recipient");
    const [source] = await connection.db
      .select()
      .from(dailySummaries)
      .where(eq(dailySummaries.id, sourceId));
    const [oldest] = await connection.db
      .select({ createdAt: dailySummaries.createdAt })
      .from(dailySummaries)
      .orderBy(dailySummaries.createdAt)
      .limit(1);
    // A separate seven-day window keeps prior runs outside the 500-job cap.
    const now = new Date(oldest.createdAt.getTime() - 8 * DAY);
    const summaryId = randomUUID();
    const snapshot = {
      ...dailySummarySnapshotSchema.parse(source.snapshot),
      localDate: now.toISOString().slice(0, 10),
    };
    const contentHash = summaryContentHash(snapshot);
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${aliceId},true)`);
      await tx.insert(dailySummaries).values({
        ...source,
        id: summaryId,
        localDate: snapshot.localDate,
        snapshot,
        contentHash,
        watermark: summaryWatermark(snapshot, summaryId, contentHash),
        createdAt: now,
      });
    });
    expect(await core.listMissingSummaryRenders(now.toISOString())).toEqual([
      { summaryId, format: "txt" },
      { summaryId, format: "png" },
    ]);
    expect(
      await core.listMissingSummaryRenders(now.toISOString(), ["txt"]),
    ).toEqual([{ summaryId, format: "txt" }]);
    expect(
      await core.listMissingSummaryRenders(
        new Date(now.getTime() + 7 * DAY + 1).toISOString(),
      ),
    ).toEqual([]);
    await connection.db.insert(activity).values({
      actorId: "system:summary-render",
      workspaceId: w,
      action: "summary.render_failed",
      resourceId: summaryId,
      details: { format: "png" },
      createdAt: now,
    });
    expect(await core.listMissingSummaryRenders(now.toISOString())).toEqual([
      { summaryId, format: "txt" },
    ]);
    expect(
      await core.listMissingSummaryRenders(
        new Date(now.getTime() + 25 * 3600000).toISOString(),
      ),
    ).toEqual([
      { summaryId, format: "txt" },
      { summaryId, format: "png" },
    ]);
    await core.storeSummaryRender({
      summaryId,
      format: "txt",
      body: "Rendered",
      rendererVersion: "test",
    });
    expect(await core.listMissingSummaryRenders(now.toISOString())).toEqual([]);
    await core.storeSummaryRender({
      summaryId,
      format: "png",
      data: PNG,
      rendererVersion: "test",
    });
    expect(
      await core.listMissingSummaryRenders(
        new Date(now.getTime() + 25 * 3600000).toISOString(),
      ),
    ).toEqual([]);
  });
});
