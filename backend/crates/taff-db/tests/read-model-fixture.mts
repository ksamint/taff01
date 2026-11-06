// Trusted test fixture, never used by a runtime adapter. Mutations remain in Node.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  connectDatabase,
  user,
  workspaces,
} from "../../../../packages/db/src/index";
import { migrateDatabase } from "../../../../packages/db/src/migrate";

const { eq, inArray, sql } = createRequire(
  new URL("../../../../packages/db/package.json", import.meta.url),
)("drizzle-orm");
const url = process.env.TEST_DATABASE_URL;
assert(url, "TEST_DATABASE_URL is required for SQL parity");
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  throw new Error("TEST_DATABASE_URL must be a valid test database URL");
}
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    parsed.pathname.endsWith("_test"),
  "SQL parity requires a loopback _test database",
);
const { db, close } = connectDatabase(url);
try {
  if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(process.argv[3]);
    assert.equal(typeof fixture.userId, "string");
    assert(Array.isArray(fixture.workspaceIds));
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id','system:rust-parity',true)`,
      );
      const [person] = await tx
        .select()
        .from(user)
        .where(eq(user.id, fixture.userId));
      assert(
        person?.email === `rust-parity-${fixture.userId}@example.test`,
        "refuse non-fixture cleanup",
      );
      const owned = await tx
        .select()
        .from(workspaces)
        .where(inArray(workspaces.id, fixture.workspaceIds));
      assert(
        owned.length === fixture.workspaceIds.length &&
          owned.every(
            (w) =>
              w.personalOwnerId === fixture.userId ||
              w.seedKey?.startsWith(`rust-parity-${fixture.userId}-`),
          ),
        "refuse non-fixture workspace cleanup",
      );
      await tx.delete(user).where(eq(user.id, fixture.userId));
      await tx
        .delete(workspaces)
        .where(inArray(workspaces.id, fixture.workspaceIds));
    });
  } else {
    await migrateDatabase(url);
    const userId = randomUUID();
    const stamp = new Date("2026-11-06T00:00:00.000Z");
    const fixture = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id','system:rust-parity',true)`,
      );
      const [person] = await tx
        .insert(user)
        .values({
          id: userId,
          name: "Rust parity 用户",
          email: `rust-parity-${userId}@example.test`,
          emailVerified: true,
          image: "https://example.test/avatar.png",
          username: `rp${userId.replaceAll("-", "").slice(0, 20)}`,
          locale: "zh-HK",
          tz: "Asia/Hong_Kong",
          createdAt: stamp,
          updatedAt: stamp,
        })
        .returning();
      const [personal] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.personalOwnerId, userId));
      const organizations = await tx
        .insert(workspaces)
        .values([
          {
            name: "Rust parity active",
            seedKey: `rust-parity-${userId}-active`,
            key: "RA",
            aiEnabled: true,
            createdAt: stamp,
            updatedAt: stamp,
          },
          {
            name: "Rust parity archived",
            key: "RZ",
            archivedAt: stamp,
            seedKey: `rust-parity-${userId}-archived`,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ])
        .returning();
      const models = [personal, ...organizations];
      const ids = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .orderBy(workspaces.createdAt, workspaces.id)
        .limit(5);
      return {
        userId,
        workspaceIds: models.map((w) => w.id),
        user: person,
        workspaces: models,
        firstWorkspaceIds: ids.map((w) => w.id),
      };
    });
    console.log(`TAFF_DB_FIXTURE=${JSON.stringify(fixture)}`);
  }
} finally {
  await close();
}
