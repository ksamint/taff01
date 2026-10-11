import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { activity, connectDatabase } from "@taff/db";
import { type ChangeEvent, memberSchema } from "@taff/schemas";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../apps/api/src/app";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP workspace agent REST PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Workspace agent tests require an isolated _test database");

describe.skipIf(!url)(
  "workspace agent creation through REST and real core",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    let app: ReturnType<typeof createApp>;
    let adminId: string;
    let workspaceId: string;
    let ownerId: string;
    let otherWorkspaceId: string;
    let adminCookie: string;
    let memberCookie: string;
    let guestCookie: string;
    let outsiderCookie: string;
    const changes: ChangeEvent[] = [];
    const authUrl = "http://localhost:3000";
    const password = `test-${randomUUID()}`;

    async function signup(name: string) {
      const result = await core.auth.api.signUpEmail({
        body: { name, email: `${randomUUID()}@test.local`, password },
      });
      const signedIn = await core.auth.api.signInEmail({
        body: { email: result.user.email, password },
        asResponse: true,
      });
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      expect(cookie).not.toBe("");
      return { ...result.user, cookie };
    }

    beforeAll(async () => {
      await migrateDatabase(url!);
      connection = connectDatabase(url!);
      const [server] = await connection.client`show server_version_num`;
      expect(Number(server.server_version_num)).toBeGreaterThanOrEqual(180000);
      expect(Number(server.server_version_num)).toBeLessThan(190000);
      core = createCore({
        databaseUrl: url!,
        authUrl,
        authSecret:
          "workspace-agent-test-secret-at-least-thirty-two-characters",
        tokenPepper: "workspace-agent-test-pepper-sixteen",
      });
      await core.subscribeChanges((event) => {
        changes.push(event);
      });
      const apiRequire = createRequire(
        new URL("../../../apps/api/package.json", import.meta.url),
      );
      app = createApp(core, authUrl, apiRequire("pino")({ enabled: false }), {
        limit: 60,
        hit: async () => ({ allowed: true, count: 1 }),
        close: async () => {},
      });
      const admin = await signup("Workspace admin");
      adminId = admin.id;
      adminCookie = admin.cookie;
      const workspace = await core.createWorkspace(userPrincipal(adminId), {
        name: "Agent REST fixture",
      });
      workspaceId = workspace.id;
      ownerId = workspace.memberId;
      for (const role of ["member", "guest"] as const) {
        const person = await signup(role);
        const invite = await core.createWorkspaceInvite(
          userPrincipal(adminId),
          workspaceId,
          { email: person.email, role },
        );
        await core.acceptWorkspaceInvite(userPrincipal(person.id), {
          token: invite.token,
        });
        if (role === "member") memberCookie = person.cookie;
        else guestCookie = person.cookie;
      }
      const outsider = await signup("Other workspace admin");
      outsiderCookie = outsider.cookie;
      otherWorkspaceId = (await core.getMe(outsider.id)).workspaces[0].id;
    }, 30000);

    afterAll(async () => {
      if (core) await core.close();
      if (connection) await connection.close();
    });

    function request(
      input: unknown,
      cookie = adminCookie,
      workspace = workspaceId,
      headers = {},
    ) {
      return app.request(`/api/workspaces/${workspace}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: authUrl,
          cookie,
          ...headers,
        },
        body: JSON.stringify(input),
      });
    }

    it("creates a usable agent with safe lazy defaults, actor audit and committed notification", async () => {
      const response = await request({
        name: "  Research assistant  ",
        kind: "agent",
      });
      expect(response.status).toBe(201);
      const payload = await response.json();
      const member = memberSchema.parse(payload);
      expect(payload).toEqual(member);
      expect(member).toMatchObject({
        workspaceId,
        userId: null,
        name: "Research assistant",
        kind: "agent",
        role: "member",
      });
      const principal = userPrincipal(adminId);
      expect(await core.listMembers(principal, workspaceId)).toContainEqual(
        expect.objectContaining(member),
      );
      const profile = await core.getAgentProfile(principal, member.id);
      expect(profile).toMatchObject({
        supervisorId: null,
        reviewPolicy: "always_review",
        maxDurationMs: null,
        maxCostMicros: null,
        grants: [],
        runs: [],
      });
      expect(profile.permissions).toEqual(
        expect.arrayContaining([
          { capability: "tasks.read", decision: "allow" },
          { capability: "repo.pr", decision: "ask" },
          { capability: "repo.merge", decision: "deny" },
          { capability: "deploy.prod", decision: "deny" },
        ]),
      );
      const audits = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.resourceId, member.id),
            eq(activity.action, "members.insert"),
          ),
        );
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: adminId, workspaceId });
      await vi.waitFor(() =>
        expect(
          changes.filter(
            (event) =>
              event.resourceId === member.id &&
              event.action === "members.insert",
          ),
        ).toEqual([expect.objectContaining({ actorId: adminId, workspaceId })]),
      );
      const task = await core.createTask(principal, {
        workspaceId,
        ownerId,
        workerId: member.id,
        title: "Agent creation usability",
      });
      expect(await core.startRun(principal, task.id, {})).toMatchObject({
        agentId: member.id,
        workspaceId,
        status: "running",
      });
    });

    it("rejects identity injection, invalid inputs and foreign origins without writes", async () => {
      const principal = userPrincipal(adminId);
      const before = await core.listMembers(principal, workspaceId);
      for (const input of [
        { name: " ", kind: "agent" },
        { name: "a".repeat(101), kind: "agent" },
        { name: "Injected", kind: "person" },
        { name: "Injected", kind: "agent", role: "admin" },
        { name: "Injected", kind: "agent", userId: adminId },
        { name: "Injected", kind: "agent", id: ownerId },
        { name: "Injected", kind: "agent", workspaceId: otherWorkspaceId },
      ])
        expect((await request(input)).status).toBe(400);
      expect(
        (
          await request(
            { name: "Foreign", kind: "agent" },
            adminCookie,
            workspaceId,
            { origin: "https://foreign.example" },
          )
        ).status,
      ).toBe(403);
      expect(
        (await request({ name: "Bad ID", kind: "agent" }, adminCookie, "bad"))
          .status,
      ).toBe(400);
      expect(await core.listMembers(principal, workspaceId)).toEqual(before);
    });

    it("denies ordinary members, guests, outsiders and agents without a MCP creation path", async () => {
      const input = { name: "Denied agent", kind: "agent" as const };
      const principal = userPrincipal(adminId);
      const before = await core.listMembers(principal, workspaceId);
      for (const cookie of [memberCookie, guestCookie, outsiderCookie]) {
        const response = await request(input, cookie);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "forbidden" });
      }
      expect((await request(input, adminCookie, otherWorkspaceId)).status).toBe(
        403,
      );
      expect((await request(input, "")).status).toBe(401);
      const agent = await core.createWorkspaceAgent(principal, workspaceId, {
        name: "Token fixture",
        kind: "agent",
      });
      const token = await core.createAgentToken(principal, {
        workspaceId,
        memberId: agent.id,
        name: "Agent REST denial",
        scopes: ["tasks:read", "tasks:write"],
      });
      expect(
        (
          await request(input, "", workspaceId, {
            authorization: `Bearer ${token.token}`,
          })
        ).status,
      ).toBe(401);
      const agentPrincipal = await core.authenticateAgentToken(token.token);
      expect(agentPrincipal).not.toBeNull();
      await expect(
        core.createWorkspaceAgent(agentPrincipal!, workspaceId, input),
      ).rejects.toMatchObject({ code: "forbidden", status: 403 });
      expect(await core.listMembers(principal, workspaceId)).toHaveLength(
        before.length + 1,
      );
    });

    it("maps concurrent duplicate names to conflict with one insert, audit and notification", async () => {
      const name = `Duplicate-${randomUUID()}`;
      const before = await connection.db
        .select({ id: activity.id })
        .from(activity)
        .where(
          and(
            eq(activity.workspaceId, workspaceId),
            eq(activity.action, "members.insert"),
          ),
        );
      const results = await Promise.all([
        request({ name, kind: "agent" }),
        request({ name: ` ${name} `, kind: "agent" }),
      ]);
      expect(results.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const conflict = results.find((response) => response.status === 409)!;
      expect(await conflict.json()).toEqual({ error: "conflict" });
      const member = memberSchema.parse(
        await results.find((response) => response.status === 201)!.json(),
      );
      const matching = (
        await core.listMembers(userPrincipal(adminId), workspaceId)
      ).filter((row) => row.name === name);
      expect(matching).toHaveLength(1);
      const audits = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.resourceId, member.id),
            eq(activity.action, "members.insert"),
          ),
        );
      expect(audits).toHaveLength(1);
      const after = await connection.db
        .select({ id: activity.id })
        .from(activity)
        .where(
          and(
            eq(activity.workspaceId, workspaceId),
            eq(activity.action, "members.insert"),
          ),
        );
      expect(after).toHaveLength(before.length + 1);
      await vi.waitFor(() =>
        expect(
          changes.filter(
            (event) =>
              event.resourceId === member.id &&
              event.action === "members.insert",
          ),
        ).toHaveLength(1),
      );
      // Agent name uniqueness is local to its workspace.
      const other = await request(
        { name, kind: "agent" },
        outsiderCookie,
        otherWorkspaceId,
      );
      expect(other.status).toBe(201);
    });
  },
);
