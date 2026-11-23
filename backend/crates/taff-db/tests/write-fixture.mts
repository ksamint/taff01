import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connectDatabase } from "../../../../packages/db/src/index";
import { migrateDatabase } from "../../../../packages/db/src/migrate";

const { sql } = createRequire(
  new URL("../../../../packages/db/package.json", import.meta.url),
)("drizzle-orm");
const url = process.env.TEST_DATABASE_URL;
assert(url, "TEST_DATABASE_URL is required for write parity");
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  throw new Error("TEST_DATABASE_URL must be a valid test database URL");
}
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    parsed.pathname.endsWith("_test"),
  "Write parity requires a loopback _test database",
);

const { client, db, close } = connectDatabase(url);
const fixtureLabel = "Taff Rust write parity fixture";
async function cleanup(schema: string) {
  assert(/^taff_write_[0-9a-f]{32}$/.test(schema), "Invalid fixture schema");
  await client.begin(async (tx) => {
    const [row] = await tx`
      select obj_description(oid, 'pg_namespace') as label
      from pg_namespace where nspname = ${schema}
    `;
    assert.equal(row?.label, fixtureLabel, "Refuse non-fixture schema cleanup");
    await tx`drop schema ${tx(schema)} cascade`;
  });
}

async function setup() {
  await migrateDatabase(url!);
  const schema = `taff_write_${randomUUID().replaceAll("-", "")}`;
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const resourceId = randomUUID();
  await client.begin(async (tx) => {
    await tx`create schema ${tx(schema)}`;
    await tx.unsafe(`comment on schema "${schema}" is '${fixtureLabel}'`);
    await tx`select set_config('search_path', ${`${schema},public`}, true)`;
    await tx`create table activity (like public.activity including defaults)`;
    await tx`
      create trigger activity_integration_context before insert on activity
      for each row execute function public.taff_integration_audit_context()
    `;
    await tx`
      create table projects (
        id uuid primary key, workspace_id uuid not null, name text not null
      )
    `;
    await tx`
      insert into projects (id, workspace_id, name)
      values (${resourceId}, ${workspaceId}, 'before')
    `;
    await tx`
      create trigger projects_audit after update on projects
      for each row execute function public.taff_audit_change()
    `;
  });
  try {
    const marker = `taff-write-parity-${resourceId}`;
    const drained = Promise.withResolvers<void>();
    const events: Array<{ resourceId: string; activityId: string }> = [];
    const listener = await client.listen("taff_changes", (payload) => {
      if (payload === marker) {
        drained.resolve();
        return;
      }
      try {
        const event = JSON.parse(payload);
        if (event?.resourceId === resourceId) events.push(event);
      } catch {
        // Other test notifications need not be JSON.
      }
    });
    try {
      // The production Node wrapper uses this actor context and lifecycle lock.
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${actorId}, true),
            pg_advisory_xact_lock_shared(hashtextextended('taff:workspace-lifecycle', 0))`,
        );
        await tx.execute(
          sql`select set_config('search_path', ${`${schema},public`}, true)`,
        );
        await tx.execute(
          sql`update projects set name = 'node' where id = ${resourceId}`,
        );
      });
      // A later committed marker drains notifications for the mutation.
      const timeout = setTimeout(
        () =>
          drained.reject(new Error("Timed out waiting for Node notification")),
        5000,
      );
      try {
        await Promise.all([
          drained.promise,
          client`select pg_notify('taff_changes', ${marker})`,
        ]);
      } finally {
        clearTimeout(timeout);
      }
      const rows = await client`
        select to_jsonb(entry) as activity from ${client(schema)}.activity as entry
      `;
      assert.equal(rows.length, 1);
      assert.equal(events.length, 1);
      const { activity } = rows[0]!;
      const event = events[0]!;
      assert.equal(event.activityId, activity.id);
      console.log(
        `TAFF_DB_WRITE_FIXTURE=${JSON.stringify({
          schema,
          actorId,
          workspaceId,
          resourceId,
          activity,
          event,
        })}`,
      );
    } finally {
      await listener.unlisten();
    }
  } catch (error) {
    await cleanup(schema);
    throw error;
  }
}

try {
  if (process.argv[2] === "cleanup") {
    await cleanup(readFileSync(0, "utf8").trim());
  } else {
    assert(
      process.argv[2] === undefined || process.argv[2] === "setup",
      "Expected setup or cleanup",
    );
    await setup();
  }
} finally {
  await close();
}
