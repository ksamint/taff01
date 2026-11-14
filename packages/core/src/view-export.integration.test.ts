import { randomUUID } from "node:crypto";
import { activity, connectDatabase, members, tasks } from "@taff/db";
import {
  calendarImageInputSchema,
  GRAPH_LAYERS,
  graphImageInputSchema,
  summaryImageLayoutInputSchema,
  timelineImageInputSchema,
} from "@taff/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

/*
 * ADR 0031 exported view images against PostgreSQL. Following AGENTS.md, the
 * one operation that issues an artifact (the export) runs with the lowest
 * role that can reach it (member), with every role that cannot, and again
 * after that member is demoted and restored.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn("SKIP view export PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("View export tests require an isolated _test database");

describe.skipIf(!url)("exported view images (ADR 0031)", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal, bob: Principal, gina: Principal, outsider: Principal;
  let agent: Principal;
  let w: string, otherW: string, owner: string, bobMember: string;
  let bobUser: string;
  let active: { id: string }, archived: { id: string }, foreign: { id: string };
  let mindNode: { id: string; version: number };
  const instant = new Date("2026-11-12T09:30:00Z");

  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "view-export-test-secret-longer-than-32",
      tokenPepper: "view-export-test-pepper",
      summaryClock: () => instant,
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
    alice = userPrincipal(a.user.id);
    const me = await core.getMe(a.user.id);
    w = me.workspaces[0].id;
    owner = me.workspaces[0].memberId;
    const b = await signup("Bob Member");
    bobUser = b.user.id;
    bob = userPrincipal(b.user.id);
    await core.updateProfile(b.user.id, { locale: "en", tz: "Asia/Shanghai" });
    const g = await signup("Gina Guest");
    gina = userPrincipal(g.user.id);
    const o = await signup("Oscar Outsider");
    outsider = userPrincipal(o.user.id);
    otherW = (await core.getMe(o.user.id)).workspaces[0].id;
    let agentMember = "";
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${a.user.id},true)`,
      );
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
            userId: g.user.id,
            name: "Gina Guest",
            kind: "person",
            role: "guest",
          },
        ])
        .returning();
      bobMember = bm.id;
      const [ag] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "Export Agent 测试", kind: "agent" })
        .returning();
      agentMember = ag.id;
    });
    agent = (await core.authenticateAgentToken(
      (
        await core.createAgentToken(alice, {
          workspaceId: w,
          memberId: agentMember,
          name: "export agent",
          scopes: ["tasks:read", "tasks:write", "summaries:read"],
        })
      ).token,
    ))!;
    active = await core.createProject(alice, w, {
      name: "Harbour fit-out",
      contractAmount: "1000.00",
      currency: "CNY",
      receivedAmount: "250.00",
    });
    await core.createTask(alice, {
      workspaceId: w,
      ownerId: owner,
      workerId: null,
      title: "Order the counter stone",
      projectId: active.id,
      dueAt: "2026-11-10T04:00:00Z",
      calendar: {
        startAt: "2026-11-12T09:00:00Z",
        endAt: "2026-11-12T10:00:00Z",
        timeZone: "UTC",
        rrule: null,
      },
    });
    const old = await core.createProject(alice, w, { name: "Closed kiosk" });
    archived = await core.updateProject(alice, old.id, {
      version: old.version,
      archived: true,
    });
    foreign = await core.createProject(outsider, otherW, {
      name: "Elsewhere",
    });
    mindNode = await core.createMindNode(bob, w, {
      title: "Shared hypothesis",
      layer: 1,
      angle: 60,
      note: "PRIVATE-NOTE",
    });
    const oldNode = await core.createMindNode(alice, w, {
      title: "Archived hypothesis",
      layer: 2,
      angle: 90,
    });
    await core.updateMindNode(alice, oldNode.id, {
      version: oldNode.version,
      archived: true,
    });
    const source = await core.createMindSource(bob, w, {
      title: "PRIVATE-SOURCE",
      url: "https://private.example.test/source",
      note: "PRIVATE-SOURCE-NOTE",
    });
    await core.linkMindSource(bob, mindNode.id, source.id);
  }, 60000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("lets a member export the workspace overview, bound to them and the data", async () => {
    const result = await core.exportViewImageInput(bob, w, { locale: "en" });
    const { fileName, ...input } = result;
    // Exactly the renderer's contract (image-2), so taff-render draws it.
    expect(summaryImageLayoutInputSchema.parse(input)).toEqual(input);
    expect(input.layout.header).toMatchObject({
      title: "Workspace overview",
      recipient: "Exported by Bob Member",
    });
    expect(input.layout.header.audience).toBe("Exported view");
    expect(input.layout.footer.confidential).toBe(
      "Internal. Exported by Bob Member.",
    );
    // The exporter's zone: 17:30 in Shanghai on the 12th.
    expect(input.layout.footer.generated).toContain("Asia/Shanghai");
    expect(input.watermark.text).toMatch(
      /^Bob Member · .+ · 2026-11-12 · export$/,
    );
    expect(input.watermark.summaryId).toBeNull();
    expect(input.layout.footer.hashFull).toBe(input.contentHash);
    expect(input.watermark.contentHash).toBe(input.contentHash);
    expect(fileName).toBe(
      `taff-workspace-2026-11-12-${input.contentHash.slice(0, 8)}.png`,
    );
    const names = input.layout.projects.map((project) => project.name);
    expect(names).toContain("Harbour fit-out");
    expect(names).not.toContain("Closed kiosk");
    expect(names).not.toContain("Elsewhere");
    const harbour = input.layout.projects.find(
      (project) => project.projectId === active.id,
    )!;
    // Members read finance (ADR 0021), so the bar is there.
    expect(harbour.finance?.label).toContain("250");
    expect(
      harbour.sections.find((section) => section.key === "overdue")?.items,
    ).toEqual([expect.objectContaining({ title: "Order the counter stone" })]);
  });

  it("exports one project, including a named archived one, and hides other workspaces", async () => {
    const one = await core.exportViewImageInput(alice, w, {
      projectId: active.id,
      locale: "zh-CN",
    });
    expect(one.layout.projects.map((project) => project.projectId)).toEqual([
      active.id,
    ]);
    expect(one.layout.header.title).toBe("项目进展");
    expect(one.layout.header.recipient).toBe("由 Alex Admin 导出");
    expect(one.fileName).toMatch(/^taff-project-2026-11-12-[a-f0-9]{8}\.png$/);
    const closed = await core.exportViewImageInput(alice, w, {
      projectId: archived.id,
      locale: "zh-HK",
    });
    expect(closed.layout.projects[0].name).toBe("Closed kiosk");
    expect(closed.layout.header.title).toBe("項目進展");
    await expect(
      core.exportViewImageInput(alice, w, {
        projectId: foreign.id,
        locale: "en",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      core.exportViewImageInput(alice, w, {
        projectId: randomUUID(),
        locale: "en",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("hashes the exact data, so a change in the data changes the hash", async () => {
    const before = await core.exportViewImageInput(bob, w, { locale: "en" });
    const again = await core.exportViewImageInput(bob, w, { locale: "en" });
    expect(again.contentHash).toBe(before.contentHash);
    await core.createTask(alice, {
      workspaceId: w,
      ownerId: owner,
      workerId: null,
      title: "Book the electrician",
      projectId: active.id,
    });
    const after = await core.exportViewImageInput(bob, w, { locale: "en" });
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["en", "zh-CN", "zh-HK"] as const)(
    "exports the member's timeline in %s with bound options, zone and audit",
    async (locale) => {
      const query = { view: "timeline" as const, projectId: active.id, locale };
      const result = await core.exportViewImageInput(bob, w, query);
      const { fileName, ...input } = result;
      expect(timelineImageInputSchema.parse(input)).toEqual(input);
      expect(input.layout.width).toBe(1600);
      expect(input.layout.title).toContain("Harbour fit-out");
      expect(input.layout.footer.text).toContain("Asia/Shanghai");
      expect(input.watermark.text).toContain("Bob Member");
      expect(input.layout.rows.map((row) => row.title)).toContain(
        "Order the counter stone",
      );
      expect(fileName).toMatch(/^taff-timeline-2026-11-12-[a-f0-9]{8}\.png$/);
      expect(
        (
          await core.exportViewImageInput(bob, w, {
            ...query,
            criticalPath: "show",
          })
        ).contentHash,
      ).toBe(input.contentHash);
      const hidden = await core.exportViewImageInput(bob, w, {
        ...query,
        criticalPath: "hide",
      });
      expect(hidden.layout.rows.every((row) => !row.critical)).toBe(true);
      expect(hidden.contentHash).not.toBe(input.contentHash);
      const [audit] = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.action, "view.export"),
            eq(activity.actorId, bobUser),
          ),
        )
        .orderBy(desc(activity.createdAt));
      expect(audit.details).toEqual({
        scope: "timeline",
        locale,
        contentHash: hidden.contentHash,
        projectCount: 1,
        finance: false,
        channel: "web",
      });
    },
  );

  it("binds timeline hashes to locale and saved viewer zone, and refuses unauthorized projects/options without audit", async () => {
    const query = {
      view: "timeline" as const,
      projectId: active.id,
      locale: "en" as const,
    };
    const base = await core.exportViewImageInput(bob, w, query);
    expect(
      (await core.exportViewImageInput(bob, w, { ...query, locale: "zh-HK" }))
        .contentHash,
    ).not.toBe(base.contentHash);
    try {
      await core.updateProfile(bobUser, {
        locale: "en",
        tz: "America/New_York",
      });
      const changed = await core.exportViewImageInput(bob, w, query);
      expect(changed.contentHash).not.toBe(base.contentHash);
      expect(changed.layout.footer.text).toContain("America/New_York");
    } finally {
      await core.updateProfile(bobUser, { locale: "en", tz: "Asia/Shanghai" });
    }
    const count = async () =>
      (
        await connection.db
          .select()
          .from(activity)
          .where(
            and(
              eq(activity.workspaceId, w),
              eq(activity.action, "view.export"),
            ),
          )
      ).length;
    const before = await count();
    for (const principal of [gina, outsider])
      await expect(
        core.exportViewImageInput(principal, w, query),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, { ...query, projectId: foreign.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      core.exportViewImageInput(bob, w, { view: "timeline", locale: "en" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.exportViewImageInput(bob, w, {
        projectId: active.id,
        criticalPath: "hide",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await count()).toBe(before);
  });

  it.each(["en", "zh-CN", "zh-HK"] as const)(
    "exports calendar windows in %s with saved zone, options hash and scheduled project audit",
    async (locale) => {
      const query = {
        view: "calendar" as const,
        calendarMode: "week" as const,
        visibleDate: "2026-11-12",
        locale,
      };
      const result = await core.exportViewImageInput(bob, w, query);
      const { fileName, ...input } = result;
      expect(calendarImageInputSchema.parse(input)).toEqual(input);
      expect(input.layout.cells).toHaveLength(7);
      expect(input.layout.cells.flatMap((cell) => cell.items)).toEqual([
        expect.objectContaining({
          title: "Order the counter stone",
          detail: "17:00–18:00",
        }),
      ]);
      expect(input.layout.footer.text).toContain("Asia/Shanghai");
      expect(input.watermark.text).toContain("Bob Member");
      expect(fileName).toMatch(/^taff-calendar-2026-11-12-[a-f0-9]{8}\.png$/);
      expect((await core.exportViewImageInput(bob, w, query)).contentHash).toBe(
        input.contentHash,
      );
      const month = await core.exportViewImageInput(bob, w, {
        ...query,
        calendarMode: "month",
      });
      expect(month.layout.cells).toHaveLength(42);
      expect(month.contentHash).not.toBe(input.contentHash);
      const next = await core.exportViewImageInput(bob, w, {
        ...query,
        visibleDate: "2026-11-19",
      });
      expect(next.layout.cells.every((cell) => cell.items.length === 0)).toBe(
        true,
      );
      expect(next.contentHash).not.toBe(input.contentHash);
      const [audit] = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.action, "view.export"),
            eq(activity.actorId, bobUser),
          ),
        )
        .orderBy(desc(activity.createdAt));
      expect(audit.resourceId).toBe(w);
      expect(audit.details).toEqual({
        scope: "calendar",
        locale,
        contentHash: next.contentHash,
        projectCount: 0,
        finance: false,
        channel: "web",
      });
    },
  );

  it("changes calendar with saved viewer zone and refuses unauthorized/irrelevant windows", async () => {
    const query = {
      view: "calendar" as const,
      calendarMode: "week" as const,
      visibleDate: "2026-11-12",
      locale: "en" as const,
    };
    const base = await core.exportViewImageInput(bob, w, query);
    try {
      await core.updateProfile(bobUser, {
        locale: "en",
        tz: "America/New_York",
      });
      const changed = await core.exportViewImageInput(bob, w, query);
      expect(changed.contentHash).not.toBe(base.contentHash);
      expect(changed.layout.cells.flatMap((cell) => cell.items)[0].detail).toBe(
        "04:00–05:00",
      );
    } finally {
      await core.updateProfile(bobUser, { locale: "en", tz: "Asia/Shanghai" });
    }
    for (const principal of [gina, outsider])
      await expect(
        core.exportViewImageInput(principal, w, query),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, { ...query, projectId: active.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.exportViewImageInput(bob, w, {
        ...query,
        visibleDate: "2026-02-30",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("keeps scheduled export stable across the 200-to-201 unscheduled tray boundary", async () => {
    const workspace = await core.createWorkspace(alice, {
      name: "Export tray isolation",
    });
    await core.createTask(alice, {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: "Scheduled",
      calendar: {
        startAt: "2026-11-12T09:00:00Z",
        endAt: "2026-11-12T10:00:00Z",
        timeZone: "UTC",
        rrule: null,
      },
    });
    const addTray = async (from: number, count: number) =>
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${(alice as { userId: string }).userId},true)`,
        );
        await tx.insert(tasks).values(
          Array.from({ length: count }, (_, index) => ({
            workspaceId: workspace.id,
            ownerId: workspace.memberId,
            number: from + index,
            title: "Unscheduled",
          })),
        );
      });
    await addTray(2, 200);
    const range = { from: "2026-11-09T00:00:00Z", to: "2026-11-16T00:00:00Z" };
    const query = {
      view: "calendar" as const,
      calendarMode: "week" as const,
      visibleDate: "2026-11-12",
      locale: "en" as const,
    };
    const normalBefore = await core.listCalendar(alice, workspace.id, range);
    expect(normalBefore.unscheduled).toHaveLength(200);
    expect(normalBefore.truncated).toBe(false);
    const before = await core.exportViewImageInput(alice, workspace.id, query);
    await addTray(202, 1);
    const normalAfter = await core.listCalendar(alice, workspace.id, range);
    expect(normalAfter.unscheduled).toHaveLength(200);
    expect(normalAfter.truncated).toBe(true);
    expect(normalAfter.occurrences).toEqual(normalBefore.occurrences);
    const after = await core.exportViewImageInput(alice, workspace.id, query);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.layout).toEqual(before.layout);
    expect(after.layout.sourceTruncatedNote).toBeNull();
    const scheduledOnly = await core.listCalendar(alice, workspace.id, range, {
      scheduledOnly: true,
    });
    expect(scheduledOnly.unscheduled).toEqual([]);
    expect(scheduledOnly.truncated).toBe(false);
  });

  it.each(["en", "zh-CN", "zh-HK"] as const)(
    "exports member-authorized mind and relations in %s with exact scope and no private fields",
    async (locale) => {
      for (const view of ["mind", "relations"] as const) {
        const query =
          view === "mind"
            ? { view, locale, archived: "exclude" as const }
            : {
                view,
                locale,
                projectId: active.id,
                scope: "project" as const,
                layout: "layered" as const,
                layers: ["org" as const],
                forceSeed: 7,
              };
        const result = await core.exportViewImageInput(bob, w, query);
        const { fileName, ...image } = result;
        expect(graphImageInputSchema.parse(image)).toEqual(image);
        expect(image.layout.kind).toBe(view);
        expect(image.layout.footer.text).toContain("Asia/Shanghai");
        expect(image.layout.subtitle).toContain("Bob Member");
        expect(image.watermark.contentHash).toBe(image.contentHash);
        expect(image.layout.footer.hashFull).toBe(image.contentHash);
        expect(fileName).toMatch(
          new RegExp(`^taff-${view}-2026-11-12-[a-f0-9]{8}\\.png$`),
        );
        expect(JSON.stringify(image)).not.toMatch(
          /PRIVATE-|private\.example|contractAmount|receivedAmount|finance/,
        );
        expect(
          (await core.exportViewImageInput(bob, w, query)).contentHash,
        ).toBe(image.contentHash);
        const [audit] = await connection.db
          .select()
          .from(activity)
          .where(
            and(
              eq(activity.action, "view.export"),
              eq(activity.actorId, bobUser),
            ),
          )
          .orderBy(desc(activity.createdAt));
        expect(audit.resourceId).toBe(view === "mind" ? w : active.id);
        expect(audit.details).toEqual({
          scope: view,
          locale,
          contentHash: image.contentHash,
          projectCount: view === "mind" ? 0 : 1,
          finance: false,
          channel: "web",
        });
      }
    },
  );

  it("hashes visible graph options/data and saved zone while excluding private source changes", async () => {
    const base = await core.exportViewImageInput(bob, w, {
      view: "mind",
      locale: "en",
    });
    expect(
      (
        await core.exportViewImageInput(bob, w, {
          view: "mind",
          locale: "en",
          archived: "exclude",
        })
      ).contentHash,
    ).toBe(base.contentHash);
    expect(base.layout.nodes.map((node) => node.label.text)).toEqual([
      "Shared hypothesis",
    ]);
    const included = await core.exportViewImageInput(bob, w, {
      view: "mind",
      archived: "include",
      locale: "en",
    });
    expect(included.layout.nodes).toHaveLength(2);
    expect(included.contentHash).not.toBe(base.contentHash);
    mindNode = await core.updateMindNode(bob, mindNode.id, {
      version: mindNode.version,
      note: "CHANGED-PRIVATE-NOTE",
    });
    expect(
      (await core.exportViewImageInput(bob, w, { view: "mind", locale: "en" }))
        .contentHash,
    ).toBe(base.contentHash);
    mindNode = await core.updateMindNode(bob, mindNode.id, {
      version: mindNode.version,
      title: "Updated hypothesis",
    });
    expect(
      (await core.exportViewImageInput(bob, w, { view: "mind", locale: "en" }))
        .contentHash,
    ).not.toBe(base.contentHash);
    const relations = await core.exportViewImageInput(bob, w, {
      view: "relations",
      projectId: active.id,
      locale: "en",
    });
    expect(
      (
        await core.exportViewImageInput(bob, w, {
          view: "relations",
          projectId: active.id,
          locale: "en",
          scope: "project",
          layout: "layered",
          layers: [...GRAPH_LAYERS].reverse(),
          forceSeed: 7,
        })
      ).contentHash,
    ).toBe(relations.contentHash);
    for (const options of [
      { layout: "force" as const },
      { layers: [] },
      { forceSeed: 8 },
      { locale: "zh-CN" as const },
    ])
      expect(
        (
          await core.exportViewImageInput(bob, w, {
            view: "relations",
            projectId: active.id,
            locale: "en",
            ...options,
          })
        ).contentHash,
      ).not.toBe(relations.contentHash);
    try {
      await core.updateProfile(bobUser, {
        tz: "America/New_York",
        locale: "en",
      });
      const changed = await core.exportViewImageInput(bob, w, {
        view: "relations",
        projectId: active.id,
        locale: "en",
      });
      expect(changed.contentHash).not.toBe(relations.contentHash);
      expect(changed.layout.footer.text).toContain("America/New_York");
    } finally {
      await core.updateProfile(bobUser, { tz: "Asia/Shanghai", locale: "en" });
    }
    for (const view of ["mind", "relations"] as const)
      for (const principal of [gina, outsider])
        await expect(
          core.exportViewImageInput(principal, w, { view }),
        ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, {
        view: "relations",
        projectId: foreign.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps CRM visibility in the authorized graph source and ignores hidden details in hashes", async () => {
    let company = await core.createCompany(alice, w, {
      name: "Graph CRM company",
      industry: "PRIVATE-INDUSTRY",
    });
    let project = await core.createProject(alice, w, {
      name: "CRM graph",
      clientCompanyId: company.id,
    });
    const query = {
      view: "relations" as const,
      projectId: project.id,
      locale: "en" as const,
    };
    const memberImage = await core.exportViewImageInput(bob, w, query);
    expect(
      memberImage.layout.nodes.some(
        (node) => node.key === `company:${company.id}`,
      ),
    ).toBe(true);
    expect(JSON.stringify(memberImage)).not.toContain("PRIVATE-INDUSTRY");
    company = await core.updateCompany(alice, company.id, {
      version: company.version,
      industry: "CHANGED-PRIVATE-INDUSTRY",
    });
    project = await core.updateProject(alice, project.id, {
      version: project.version,
      contractAmount: "9876.00",
      currency: "CNY",
    });
    expect((await core.exportViewImageInput(bob, w, query)).contentHash).toBe(
      memberImage.contentHash,
    );
    const hidden = await core.exportViewImageInput(agent, w, query, "mcp");
    expect(
      hidden.layout.nodes.some((node) => node.key.startsWith("company:")),
    ).toBe(false);
    await core.updateCompany(alice, company.id, {
      version: company.version,
      name: "Hidden renamed company",
    });
    expect(
      (await core.exportViewImageInput(agent, w, query, "mcp")).contentHash,
    ).toBe(hidden.contentHash);
    const memberId = (agent as { memberId: string }).memberId;
    await core.setAgentPermission(alice, memberId, {
      capability: "crm.read",
      decision: "allow",
    });
    expect(
      (
        await core.exportViewImageInput(agent, w, query, "mcp")
      ).layout.nodes.some((node) => node.key === `company:${company.id}`),
    ).toBe(true);
    await core.setAgentPermission(alice, memberId, {
      capability: "crm.read",
      decision: "deny",
    });
    expect(
      (await core.exportViewImageInput(agent, w, query, "mcp")).contentHash,
    ).toBe(hidden.contentHash);
  });

  it("audits each authorized snapshot with allowlisted metadata and no change notification", async () => {
    const rows = () =>
      connection.db
        .select()
        .from(activity)
        .where(
          and(eq(activity.workspaceId, w), eq(activity.action, "view.export")),
        );
    const previous = new Set((await rows()).map((row) => row.id));
    const notifications: string[] = [];
    const listener = await connection.client.listen(
      "taff_changes",
      (payload) => {
        notifications.push(payload);
      },
    );
    try {
      const project = await core.exportViewImageInput(bob, w, {
        projectId: active.id,
        locale: "zh-HK",
      });
      const workspace = await core.exportViewImageInput(bob, w, {
        locale: "en",
      });
      const recorded = (await rows()).filter((row) => !previous.has(row.id));
      expect(recorded).toHaveLength(2);
      for (const [resourceId, scope, locale, result] of [
        [active.id, "project", "zh-HK", project],
        [w, "workspace", "en", workspace],
      ] as const) {
        const row = recorded.find((entry) => entry.resourceId === resourceId);
        expect(row).toMatchObject({
          actorId: bobUser,
          workspaceId: w,
          action: "view.export",
        });
        expect(row?.details).toEqual({
          scope,
          locale,
          contentHash: result.contentHash,
          projectCount: result.layout.projects.length,
          finance: true,
          channel: "web",
        });
      }
      const audit = await core.searchIntegrationAudit(alice, {
        workspaceId: w,
      });
      expect(
        audit.entries.filter((row) =>
          recorded.some((entry) => entry.id === row.id),
        ),
      ).toHaveLength(2);
      for (const principal of [gina, outsider])
        await expect(
          core.exportViewImageInput(principal, w, { locale: "en" }),
        ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.exportViewImageInput(bob, w, {
          locale: "en",
          projectId: foreign.id,
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        core.exportViewImageInput(bob, "invalid", { locale: "en" }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(
        (await rows()).filter((row) => !previous.has(row.id)),
      ).toHaveLength(2);

      // A later committed marker is a barrier for notifications from the export transactions.
      const marker = `export-audit-${randomUUID()}`;
      await connection.client`select pg_notify('taff_changes',${marker})`;
      await vi.waitFor(() => expect(notifications).toContain(marker));
      expect(notifications).toEqual([marker]);
    } finally {
      await listener.unlisten();
    }
  });

  it("enforces both current grant scopes and revocation, ignoring cached principal scopes", async () => {
    const memberId = (agent as { memberId: string }).memberId;
    const issued = await core.createAgentToken(alice, {
      workspaceId: w,
      memberId,
      name: "grant-test",
      scopes: ["tasks:read", "summaries:read"],
    });
    const p = (await core.authenticateAgentToken(issued.token))!;
    for (const view of ["mind", "relations"] as const)
      await expect(
        core.exportViewImageInput(p, w, { view }, "mcp"),
      ).resolves.toHaveProperty("layout");
    await expect(
      core.exportViewImageInput(p, w, {}, "mcp"),
    ).resolves.toHaveProperty("layout");
    for (const scopes of [["tasks:read"], ["summaries:read"]] as const) {
      await core.setAgentTokenWorkspace(alice, issued.id, {
        workspaceId: w,
        memberId,
        scopes: [...scopes],
      });
      await expect(
        core.exportViewImageInput(p, w, {}, "mcp"),
      ).rejects.toMatchObject({ code: "forbidden" });
      for (const view of ["mind", "relations"] as const)
        await expect(
          core.exportViewImageInput(p, w, { view }, "mcp"),
        ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.exportViewImageInput(
          p,
          w,
          { view: "calendar", calendarMode: "week", visibleDate: "2026-11-12" },
          "mcp",
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.exportViewImageInput(
          p,
          w,
          { view: "timeline", projectId: active.id },
          "mcp",
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    await core.setAgentTokenWorkspace(alice, issued.id, {
      workspaceId: w,
      memberId,
      scopes: ["tasks:read", "summaries:read"],
      revoked: true,
    });
    for (const view of ["mind", "relations"] as const)
      await expect(
        core.exportViewImageInput(p, w, { view }, "mcp"),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(
        p,
        w,
        { view: "calendar", calendarMode: "week", visibleDate: "2026-11-12" },
        "mcp",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(p, w, {}, "mcp"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("exports for both scopes with issuer preferences, agent watermark and MCP audit", async () => {
    await core.updateProfile((alice as { userId: string }).userId, {
      locale: "zh-CN",
      tz: "Asia/Shanghai",
    });
    const image = await core.exportViewImageInput(agent, w, {}, "mcp");
    for (const view of ["mind", "relations"] as const) {
      const graph = await core.exportViewImageInput(agent, w, { view }, "mcp");
      expect(graph.layout.locale).toBe("zh-CN");
      expect(graph.layout.footer.text).toContain("Asia/Shanghai");
      expect(graph.watermark.text).toContain("Export Agent");
    }
    const timelineImage = await core.exportViewImageInput(
      agent,
      w,
      { view: "timeline", projectId: active.id },
      "mcp",
    );
    expect(timelineImage.layout.locale).toBe("zh-CN");
    expect(timelineImage.layout.footer.text).toContain("Asia/Shanghai");
    expect(timelineImage.watermark.text).toContain("Export Agent");
    const calendarImage = await core.exportViewImageInput(
      agent,
      w,
      { view: "calendar", calendarMode: "week", visibleDate: "2026-11-12" },
      "mcp",
    );
    expect(calendarImage.layout.locale).toBe("zh-CN");
    expect(calendarImage.layout.subtitle).toContain("Asia/Shanghai");
    expect(calendarImage.watermark.text).toContain("Export Agent");
    expect(image.watermark.text).toContain("Export Agent");
    expect(image.fileName).toContain("Export Agent 测试");
    const [row] = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.action, "view.export"),
          eq(activity.actorId, (agent as { memberId: string }).memberId),
        ),
      )
      .orderBy(desc(activity.createdAt));
    expect(row.details).toMatchObject({
      channel: "mcp",
      locale: "zh-CN",
      finance: false,
    });
    await expect(
      core.exportViewImageInput(agent, otherW, {}, "mcp"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentPermission(
      alice,
      (agent as { memberId: string }).memberId,
      { capability: "projects.manage", decision: "allow" },
    );
    const financial = await core.exportViewImageInput(
      agent,
      w,
      { projectId: active.id },
      "mcp",
    );
    expect(financial.layout.projects[0].finance).not.toBeNull();
    await core.setAgentPermission(
      alice,
      (agent as { memberId: string }).memberId,
      { capability: "projects.manage", decision: "deny" },
    );
    const hidden = await core.exportViewImageInput(
      agent,
      w,
      { projectId: active.id },
      "mcp",
    );
    expect(hidden.layout.projects[0].finance).toBeNull();
    await core.revokeAgentToken(alice, (agent as { tokenId: string }).tokenId);
    for (const view of ["mind", "relations"] as const)
      await expect(
        core.exportViewImageInput(agent, w, { view }, "mcp"),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(
        agent,
        w,
        { view: "calendar", calendarMode: "week", visibleDate: "2026-11-12" },
        "mcp",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(agent, w, {}, "mcp"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(
        agent,
        w,
        { view: "timeline", projectId: active.id },
        "mcp",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses guests, outsiders and invalid input", async () => {
    for (const principal of [gina, outsider])
      await expect(
        core.exportViewImageInput(principal, w, { locale: "en" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, "not-an-id", { locale: "en" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.exportViewImageInput(bob, w, {
        locale: "fr",
      } as unknown as { locale: "en" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("stops a demoted member and allows them again once restored", async () => {
    await core.updateMemberRole(alice, w, bobMember, { role: "guest" });
    for (const view of ["mind", "relations"] as const)
      await expect(
        core.exportViewImageInput(bob, w, { view }),
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, {
        view: "calendar",
        calendarMode: "week",
        visibleDate: "2026-11-12",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, {
        view: "timeline",
        projectId: active.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.exportViewImageInput(bob, w, { locale: "en" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.updateMemberRole(alice, w, bobMember, { role: "member" });
    for (const view of ["mind", "relations"] as const)
      await expect(
        core.exportViewImageInput(bob, w, { view }),
      ).resolves.toHaveProperty("layout");
    await expect(
      core.exportViewImageInput(bob, w, {
        view: "calendar",
        calendarMode: "week",
        visibleDate: "2026-11-12",
      }),
    ).resolves.toMatchObject({ contentHash: expect.any(String) });
    await expect(
      core.exportViewImageInput(bob, w, {
        view: "timeline",
        projectId: active.id,
      }),
    ).resolves.toMatchObject({ contentHash: expect.any(String) });
    await expect(
      core.exportViewImageInput(bob, w, { locale: "en" }),
    ).resolves.toMatchObject({ contentHash: expect.any(String) });
  });
});
