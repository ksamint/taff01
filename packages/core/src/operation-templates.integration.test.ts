import { randomUUID } from "node:crypto";
import { connectDatabase, members } from "@taff/db";
import {
  GENERIC_OPERATION_SECTORS,
  indicatorTaskTitle,
  type OperationTemplateKey,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("operation templates (OT-1)", () => {
  const connection = url ? connectDatabase(url) : null;
  const core = url
    ? createCore({
        databaseUrl: url,
        authUrl: "http://localhost:3000",
        authSecret: "operation-template-test-secret-at-least-32-chars",
        tokenPepper: "operation-template-test-pepper",
      })
    : null;
  const signUp = async (name: string) =>
    (
      await core!.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      })
    ).user.id;
  let admin: string;
  let workspaceId: string;
  const join = async (userId: string, role: "member" | "guest" | "admin") =>
    connection!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${admin},true)`);
      await tx
        .insert(members)
        .values({ workspaceId, userId, name: role, kind: "person", role });
    });
  beforeAll(async () => {
    await migrateDatabase(url!);
    admin = await signUp("Template admin");
    workspaceId = (
      await core!.createWorkspace(userPrincipal(admin), {
        name: `XIDING ${randomUUID().slice(0, 8)}`,
      })
    ).id;
  });
  afterAll(async () => {
    await core?.close();
    await connection?.close();
  });

  it("OT-1.1–1.3 creates six sector projects with labelled indicator tasks, once", async () => {
    const result = await core!.applyOperationTemplate(
      userPrincipal(admin),
      workspaceId,
      "generic-operation",
    );
    expect(result).toEqual({
      template: "generic-operation",
      createdProjects: 6,
      createdTasks: 12,
    });
    const projects = await core!.listProjects(
      userPrincipal(admin),
      workspaceId,
    );
    expect(projects.map((p) => p.name)).toEqual(
      GENERIC_OPERATION_SECTORS.map((s) => s.project),
    );
    const tasks = await core!.listTasks(userPrincipal(admin), workspaceId);
    const me = (await core!.getMe(admin)).workspaces.find(
      (w) => w.id === workspaceId,
    )!;
    for (const [i, sector] of GENERIC_OPERATION_SECTORS.entries()) {
      const inProject = tasks.filter((t) => t.projectId === projects[i].id);
      expect(inProject.map((t) => [t.title, t.labels]).sort()).toEqual(
        [
          [
            indicatorTaskTitle(sector.leading),
            [sector.label, sector.leading.label],
          ],
          [
            indicatorTaskTitle(sector.result),
            [sector.label, sector.result.label],
          ],
        ].sort(),
      );
      for (const task of inProject) {
        expect(task.ownerId).toBe(me.memberId);
        expect(task.status).toBe("todo");
      }
    }
    // Repeat and concurrent applies create nothing more.
    const again = await Promise.all([
      core!.applyOperationTemplate(
        userPrincipal(admin),
        workspaceId,
        "generic-operation",
      ),
      core!.applyOperationTemplate(
        userPrincipal(admin),
        workspaceId,
        "generic-operation",
      ),
    ]);
    for (const r of again)
      expect(r).toMatchObject({ createdProjects: 0, createdTasks: 0 });
    expect(
      await core!.listProjects(userPrincipal(admin), workspaceId),
    ).toHaveLength(6);
  });

  it("OT-1.2 restores only what is missing", async () => {
    const [first] = await core!.listProjects(userPrincipal(admin), workspaceId);
    await core!.updateProject(userPrincipal(admin), first.id, {
      version: first.version,
      archived: true,
    });
    const result = await core!.applyOperationTemplate(
      userPrincipal(admin),
      workspaceId,
      "generic-operation",
    );
    expect(result).toMatchObject({ createdProjects: 1, createdTasks: 2 });
  });

  it("OT-2.1–2.3 refuses members, guests, agents, outsiders and demoted admins", async () => {
    const apply = (p: Principal, w = workspaceId) =>
      core!.applyOperationTemplate(p, w, "generic-operation");
    const member = await signUp("Template member");
    const guest = await signUp("Template guest");
    const outsider = await signUp("Template outsider");
    const former = await signUp("Template former admin");
    await join(member, "member");
    await join(guest, "guest");
    await join(former, "admin");
    for (const id of [member, guest, outsider])
      await expect(apply(userPrincipal(id))).rejects.toMatchObject({
        status: 403,
      });
    await expect(apply(userPrincipal(former))).resolves.toMatchObject({
      createdProjects: 0,
    });
    await connection!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${admin},true)`);
      await tx
        .update(members)
        .set({ role: "member" })
        .where(
          and(eq(members.workspaceId, workspaceId), eq(members.userId, former)),
        );
    });
    await expect(apply(userPrincipal(former))).rejects.toMatchObject({
      status: 403,
    });
    const [agent] = (
      await core!.listMembers(userPrincipal(admin), workspaceId)
    ).filter((m) => m.kind === "agent");
    await expect(
      apply({
        kind: "agent",
        tokenId: randomUUID(),
        memberId: agent.id,
        workspaceId,
        scopes: ["tasks:write"],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      core!.applyOperationTemplate(
        userPrincipal(admin),
        workspaceId,
        "unknown" as OperationTemplateKey,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
