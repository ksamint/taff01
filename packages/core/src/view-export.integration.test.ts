import { randomUUID } from "node:crypto";
import { activity, connectDatabase, members } from "@taff/db";
import {
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
    });
    const old = await core.createProject(alice, w, { name: "Closed kiosk" });
    archived = await core.updateProject(alice, old.id, {
      version: old.version,
      archived: true,
    });
    foreign = await core.createProject(outsider, otherW, {
      name: "Elsewhere",
    });
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
    const timelineImage = await core.exportViewImageInput(
      agent,
      w,
      { view: "timeline", projectId: active.id },
      "mcp",
    );
    expect(timelineImage.layout.locale).toBe("zh-CN");
    expect(timelineImage.layout.footer.text).toContain("Asia/Shanghai");
    expect(timelineImage.watermark.text).toContain("Export Agent");
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
