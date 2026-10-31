import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { connectDatabase, members } from "@taff/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { createCore, userPrincipal } from "./index";

const opened = vi.hoisted(() => [] as ReturnType<typeof connectDatabase>[]);
vi.mock("@taff/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@taff/db")>();
  return {
    ...original,
    connectDatabase: (...args: Parameters<typeof connectDatabase>) => {
      const connection = original.connectDatabase(...args);
      opened.push(connection);
      return connection;
    },
  };
});
const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Statement timeout tests require an isolated _test database");
const options = {
  authUrl: "http://localhost:3000",
  authSecret: "timeout-test-secret-at-least-thirty-two",
  tokenPepper: "timeout-test-pepper-sixteen",
};
let maintenance: ReturnType<typeof connectDatabase>;
beforeAll(async () => {
  if (!url) return;
  await migrateDatabase(url);
  const maintenanceUrl = new URL(url);
  maintenanceUrl.searchParams.delete("statement_timeout");
  maintenance = connectDatabase(maintenanceUrl.toString());
});
afterAll(async () => {
  await maintenance?.close();
});

describe.skipIf(!url)("runtime SQL deadline", () => {
  it("defaults core to 20s without changing maintenance connections", async () => {
    const before = await maintenance.client`show statement_timeout`;
    const defaultUrl = new URL(url!);
    defaultUrl.searchParams.delete("statement_timeout");
    const core = createCore({ ...options, databaseUrl: defaultUrl.toString() });
    const runtime = opened.at(-1)!;
    try {
      const setting = await runtime.client`show statement_timeout`;
      expect(setting[0].statement_timeout).toBe("20s");
      expect(await maintenance.client`show statement_timeout`).toEqual(before);
      expect(
        maintenance.client.options.connection.statement_timeout,
      ).toBeUndefined();
    } finally {
      await core.close();
    }
  });

  it("rolls back timed-out writes and leaves the pool usable", async () => {
    const runtimeUrl = new URL(url!);
    runtimeUrl.searchParams.set("statement_timeout", "500");
    const core = createCore({ ...options, databaseUrl: runtimeUrl.toString() });
    const runtime = opened.at(-1)!;
    const id = randomUUID();
    try {
      await expect(
        runtime.client.begin(async (tx) => {
          await tx`select set_config('taff.actor_id', 'test:timeout', true)`;
          await tx`insert into workspaces (id, name) values (${id}, 'Timeout rollback')`;
          await tx`select pg_sleep(2)`;
        }),
      ).rejects.toMatchObject({ code: "57014" });
      expect(
        await maintenance.client`select id from workspaces where id=${id}`,
      ).toHaveLength(0);
      expect((await runtime.client`select 1 as recovered`)[0].recovered).toBe(
        1,
      );
    } finally {
      await core.close();
    }
  });

  it("preserves explicit zero and reclaims an aborted locked query without releasing its blocker", async () => {
    const zeroUrl = new URL(url!);
    zeroUrl.searchParams.set("statement_timeout", "0");
    const zero = createCore({ ...options, databaseUrl: zeroUrl.toString() });
    try {
      expect(
        (await opened.at(-1)!.client`show statement_timeout`)[0]
          .statement_timeout,
      ).toBe("0");
    } finally {
      await zero.close();
    }
    const runtimeUrl = new URL(url!);
    const application = `timeout-${randomUUID()}`;
    runtimeUrl.searchParams.set("statement_timeout", "500");
    runtimeUrl.searchParams.set("application_name", application);
    const core = createCore({ ...options, databaseUrl: runtimeUrl.toString() });
    const runtime = opened.at(-1)!;
    const person = await core.auth.api.signUpEmail({
      body: {
        name: "Timeout fixture",
        email: `${randomUUID()}@test.local`,
        password: randomUUID(),
      },
    });
    const workspace = (await core.getMe(person.user.id)).workspaces[0];
    let release!: () => void;
    let ready!: () => void;
    let completed!: () => void;
    let errorCode: unknown;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const blocker = maintenance.db.transaction(async (tx) => {
      await tx
        .select()
        .from(members)
        .where(eq(members.id, workspace.memberId))
        .for("update");
      ready();
      await held;
    });
    const server = createServer((_req, res) => {
      void core
        .listMembers(userPrincipal(person.user.id), workspace.id)
        .then((value) => {
          if (!res.destroyed) res.end(JSON.stringify(value));
        })
        .catch((error) => {
          errorCode = (error.cause ?? error).code;
          if (!res.destroyed) res.writeHead(500).end();
        })
        .finally(completed);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing HTTP listener");
    const endpoint = `http://127.0.0.1:${address.port}`;
    try {
      await locked;
      const abort = new AbortController();
      const abandoned = fetch(endpoint, { signal: abort.signal }).catch(
        (error: Error) => error.name,
      );
      const deadline = Date.now() + 5000;
      let pid: number | undefined;
      while (!pid && Date.now() < deadline) {
        const rows =
          await maintenance.client`select pid from pg_stat_activity where application_name=${application} and wait_event_type='Lock'`;
        pid = rows[0]?.pid;
        if (!pid) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(pid).toBeDefined();
      abort.abort();
      expect(await abandoned).toBe("AbortError");
      await finished; // The blocker is still held; only the configured SQL deadline can free this query.
      expect(errorCode).toBe("57014");
      const rows =
        await maintenance.client`select state,wait_event_type from pg_stat_activity where pid=${pid!}`;
      expect(rows[0]).toMatchObject({
        state: "idle",
        wait_event_type: "Client",
      });
      expect((await runtime.client`select 1 as recovered`)[0].recovered).toBe(
        1,
      );
      release();
      await blocker;
      expect((await fetch(endpoint)).status).toBe(200);
    } finally {
      release();
      await blocker;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await core.close();
    }
  });
});
