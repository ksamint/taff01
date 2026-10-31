import { randomUUID } from "node:crypto";
import { connectDatabase, members, workspaces } from "@taff/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const queries = vi.hoisted(() => [] as string[]);
vi.mock("@taff/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@taff/db")>();
  const { drizzle } = await import("drizzle-orm/postgres-js");
  return {
    ...original,
    connectDatabase: (...args: Parameters<typeof original.connectDatabase>) => {
      const connection = original.connectDatabase(...args);
      return {
        ...connection,
        db: drizzle(connection.client, {
          schema: original,
          logger: { logQuery: (query) => queries.push(query) },
        }),
      };
    },
  };
});
const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Discovery tests require isolated _test database");
let core: Core;
let connection: ReturnType<typeof connectDatabase>;
beforeAll(async () => {
  if (!url) return;
  await migrateDatabase(url);
  connection = connectDatabase(url);
  core = createCore({
    databaseUrl: url,
    authUrl: "http://localhost:3100",
    authSecret: "workspace-discovery-isolated-secret-32",
    tokenPepper: "workspace-discovery-test-pepper",
  });
});
afterAll(async () => {
  await core?.close();
  await connection?.close();
});
it.skipIf(!url)(
  "discovery query count is independent of unrelated organizations and rechecks revocation",
  async () => {
    const account = await core.auth.api.signUpEmail({
      body: {
        name: "Discovery",
        email: `${randomUUID()}@test.local`,
        password: randomUUID(),
      },
    });
    const owner = userPrincipal(account.user.id);
    const workspace = (await core.getMe(account.user.id)).workspaces[0];
    const agent = await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${account.user.id}, true)`,
      );
      const [row] = await tx
        .insert(members)
        .values({ workspaceId: workspace.id, kind: "agent", name: "Discovery" })
        .returning();
      return row;
    });
    const token = await core.createAgentToken(owner, {
      workspaceId: workspace.id,
      memberId: agent.id,
      name: "Discovery",
      scopes: ["tasks:read"],
    });
    const principal = (await core.authenticateAgentToken(token.token))!;
    queries.length = 0;
    const before = await core.listAgentWorkspaces(principal);
    const count = queries.length;
    expect(before).toEqual([
      {
        id: workspace.id,
        name: workspace.name,
        memberId: agent.id,
        scopes: ["tasks:read"],
      },
    ]);
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${account.user.id}, true)`,
      );
      await tx
        .insert(workspaces)
        .values(
          Array.from({ length: 40 }, (_, i) => ({ name: `Unrelated ${i}` })),
        );
    });
    queries.length = 0;
    expect(await core.listAgentWorkspaces(principal)).toEqual(before);
    if (process.env.AUDIT_QUERY_COUNTS === "1")
      console.log(
        JSON.stringify({
          queryAudit: { before: count, after40Unrelated: queries.length },
        }),
      );
    expect(queries.length).toBe(count);
    expect(count).toBeGreaterThan(0);
    await core.setAgentTokenWorkspace(owner, token.id, {
      workspaceId: workspace.id,
      memberId: agent.id,
      scopes: ["tasks:read"],
      revoked: true,
    });
    expect(await core.listAgentWorkspaces(principal)).toEqual([]);
    await core.revokeAgentToken(owner, token.id);
    await expect(core.listAgentWorkspaces(principal)).rejects.toMatchObject({
      code: "forbidden",
    });
  },
);
