import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import {
  connectDatabase,
  session,
  user,
  workspaces,
} from "../../../packages/db/src/index";
import { migrateDatabase } from "../../../packages/db/src/migrate";
import { createApp } from "../src/app";

const { and, eq, inArray, sql } = createRequire(
  new URL("../../../packages/db/package.json", import.meta.url),
)(
  "drizzle-orm",
) as typeof import("../../../packages/db/node_modules/drizzle-orm/index.js");
const authUrl = "http://localhost:3000";
// Public fixture values shared with the Rust integration test.
const authSecret = "taff-rust-session-fixture-secret-not-for-production";
const password = "taff-rust-session-fixture-password";
const name = "Taff Rust session parity fixture";
const fixtureEmail = /^rust-session-parity-[\da-f-]{36}@example\.test$/;
const userIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
assert(testDatabaseUrl, "TEST_DATABASE_URL is required");
const database = URL.parse(testDatabaseUrl);
assert(
  database &&
    ["postgres:", "postgresql:"].includes(database.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
    database.pathname.endsWith("_test"),
  "Session parity requires a loopback _test database",
);
// PostgreSQL notices would be written to the fixture's stdout by the driver.
database.searchParams.set("client_min_messages", "warning");
const databaseUrl = database.href;
const connection = connectDatabase(databaseUrl);
let stage = "setup";

async function cleanup(userId: string) {
  assert(userIdPattern.test(userId), "Expected a fixture user ID");
  await connection.db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('taff.actor_id', 'system:rust-session-parity', true)`,
    );
    const [person] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    assert(
      person?.name === name && fixtureEmail.test(person.email),
      "Refuse non-fixture cleanup",
    );
    const [personal] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.personalOwnerId, userId))
      .for("update");
    await tx.delete(user).where(eq(user.id, userId));
    if (personal)
      await tx.delete(workspaces).where(eq(workspaces.id, personal.id));
  });
}

async function setup(databaseUrl: string) {
  assert(!process.stdout.isTTY, "Session parity requires captured stdout");
  stage = "migration";
  await migrateDatabase(databaseUrl);
  const core = createCore({
    databaseUrl,
    authUrl,
    authSecret,
    tokenPepper: "taff-rust-session-fixture-pepper",
  });
  let userId: string | undefined;
  try {
    stage = "sign-up";
    const email = `rust-session-parity-${randomUUID()}@example.test`;
    const signup = await core.auth.api.signUpEmail({
      body: { name, email, password },
    });
    userId = signup.user.id;
    const app = createApp(core, authUrl, pino({ enabled: false }), {
      limit: 1,
      hit: async () => ({ allowed: true, count: 1 }),
      close: async () => {},
    });
    app.get("/api/session-parity", (c) => c.json({ userId: c.get("userId") }));
    const errorCodes = {
      400: "invalid_input",
      401: "unauthorized",
      403: "forbidden",
      404: "not_found",
      409: "conflict",
    } as const;
    for (const status of [400, 401, 403, 404, 409] as const) {
      app.get(`/session-parity/errors/${status}`, () => {
        throw new CoreError(errorCodes[status], status);
      });
    }
    async function signedSession() {
      const response = await core.auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      assert(response.ok, "Fixture sign-in failed");
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .find((value) => value.startsWith("better-auth.session_token="));
      assert(cookie, "Fixture sign-in did not return a session cookie");
      const authenticated = await core.auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      assert(authenticated, "Fixture session was not authenticated");
      return { cookie, id: authenticated.session.id };
    }

    stage = "sign-in";
    const valid = await signedSession();
    const expired = await signedSession();
    const expiredForNode = await signedSession();
    stage = "expiry";
    const rows = await connection.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(
        and(
          eq(session.userId, userId),
          inArray(session.id, [expired.id, expiredForNode.id]),
        ),
      )
      .returning({ id: session.id });
    assert.equal(rows.length, 2, "Fixture sessions were not expired");
    const cookiePrefix = "better-auth.session_token=";
    const signedValue = decodeURIComponent(
      valid.cookie.slice(cookiePrefix.length),
    );
    const signatureStart = signedValue.lastIndexOf(".") + 1;
    assert(signatureStart > 0, "Fixture cookie is unsigned");
    const replacement = signedValue[signatureStart] === "A" ? "B" : "A";
    const tampered =
      cookiePrefix +
      encodeURIComponent(
        signedValue.slice(0, signatureStart) +
          replacement +
          signedValue.slice(signatureStart + 1),
      );
    async function outcome(path: string, cookie?: string) {
      const response = await app.request(path, {
        headers: cookie ? { cookie } : undefined,
      });
      return { status: response.status, body: await response.json() };
    }
    stage = "Node parity requests";
    const path = "/api/session-parity";
    return {
      userId,
      validSessionId: valid.id,
      expiredSessionId: expired.id,
      cookies: { valid: valid.cookie, tampered, expired: expired.cookie },
      sessions: {
        valid: await outcome(path, valid.cookie),
        tampered: await outcome(path, tampered),
        expired: await outcome(path, expiredForNode.cookie),
        absent: await outcome(path),
      },
      errors: Object.fromEntries(
        await Promise.all(
          Object.keys(errorCodes).map(async (status) => [
            status,
            await outcome(`/session-parity/errors/${status}`),
          ]),
        ),
      ),
      health: await outcome("/api/health"),
    };
  } catch (error) {
    if (userId) await cleanup(userId);
    throw error;
  } finally {
    await core.close();
  }
}

try {
  if (process.argv[2] === "cleanup") {
    stage = "cleanup";
    await cleanup(readFileSync(0, "utf8").trim());
  } else {
    assert(
      process.argv[2] === undefined || process.argv[2] === "setup",
      "Expected setup or cleanup",
    );
    process.stdout.write(`${JSON.stringify(await setup(databaseUrl))}\n`);
  }
} catch {
  // Database and authentication errors may contain fixture data.
  process.stderr.write(`Session parity fixture failed during ${stage}\n`);
  process.exitCode = 1;
} finally {
  await connection.close();
}
