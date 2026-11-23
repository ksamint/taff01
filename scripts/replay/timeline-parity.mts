import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { accessSync, constants } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "../../apps/api/src/app";
import { createCore } from "../../packages/core/src/index";
import { connectDatabase } from "../../packages/db/src/index";
import { migrateDatabase } from "../../packages/db/src/migrate";

const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const pino = apiRequire(
  "pino",
) as typeof import("../../apps/api/node_modules/pino");
const authSecret = "timeline-wire-parity-only-auth-secret-value";
const password = "timeline-parity-fixture-only-password";
const profiles = [
  ["en", "America/Los_Angeles"],
  ["zh-CN", "Asia/Shanghai"],
  ["zh-HK", "Asia/Hong_Kong"],
] as const;
const roles = ["admin", "member", "guest", "foreign"] as const;
const routes = ["timeline", "milestones", "payments"] as const;
type Role = (typeof roles)[number];
type Person = { id: string; cookie: string };
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const fixtureId = (value: number) =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const workspace = fixtureId(1);
const project = fixtureId(2);
const admins = fixtureId(3);
const member = fixtureId(4);
const guest = fixtureId(5);
const worker = fixtureId(6);
const rootTask = fixtureId(10);
const childTask = fixtureId(11);
const unscheduled = fixtureId(12);
const archived = fixtureId(13);
const milestone = fixtureId(20);
const milestoneTie = fixtureId(21);
const hiddenMilestone = fixtureId(22);
const foreignWorkspace = fixtureId(90);
const foreignProject = fixtureId(91);
const foreignMember = fixtureId(92);
const missingProject = fixtureId(100);
let stage = "validating inputs";

function testDatabase() {
  const url = URL.parse(process.env.TEST_DATABASE_URL ?? "");
  assert(
    url &&
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      /^\/[a-z0-9_]+_test$/.test(url.pathname) &&
      !url.search &&
      !url.hash,
    "TEST_DATABASE_URL must identify a loopback _test database without URL options",
  );
  return url;
}

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const closeServer = (server: Server) =>
  new Promise<void>((done) => server.close(() => done()));

async function startRust(binary: string, databaseUrl: string, authUrl: string) {
  const probe = createServer();
  const origin = await listen(probe);
  await closeServer(probe);
  const child = spawn(binary, {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: databaseUrl,
      AUTH_URL: authUrl,
      AUTH_SECRET: authSecret,
      API_RS_HOST: "127.0.0.1",
      API_RS_PORT: new URL(origin).port,
    },
    stdio: "ignore",
  });
  try {
    await once(child, "spawn");
    const url = origin + "/api/health";
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(400),
        redirect: "manual",
      }).catch(() => null);
      if (response?.ok) {
        await response.arrayBuffer();
        return { child, origin };
      }
      await sleep(100);
    }
    throw new Error("standalone Rust failed to become healthy");
  } catch (error) {
    await stopRust(child);
    throw error;
  }
}

async function stopRust(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (
    (await Promise.race([exited, sleep(2000, null, { ref: false })])) === null
  ) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function seed(
  connection: ReturnType<typeof connectDatabase>,
  people: Record<Role, Person>,
) {
  await connection.client.begin(async (sql) => {
    await sql`select set_config('taff.actor_id', ${people.admin.id}, true)`;
    await sql`insert into workspaces (id, name, key)
      values (${workspace}, 'Timeline parity', 'TL'),
             (${foreignWorkspace}, 'Separate workspace', 'FW')`;
    await sql`insert into members (id, workspace_id, user_id, name, kind, role)
      values (${admins}, ${workspace}, ${people.admin.id}, 'Owner', 'person', 'admin'),
             (${member}, ${workspace}, ${people.member.id}, 'Contributor', 'person', 'member'),
             (${guest}, ${workspace}, ${people.guest.id}, 'Observer', 'person', 'guest'),
             (${worker}, ${workspace}, null, 'Timeline agent', 'agent', 'member'),
             (${foreignMember}, ${foreignWorkspace}, ${people.foreign.id}, 'Foreign admin', 'person', 'admin')`;
    await sql`insert into projects (id, workspace_id, name, contract_amount, currency)
      values (${project}, ${workspace}, 'Timeline and finance', 400.73, 'USD'),
             (${foreignProject}, ${foreignWorkspace}, 'Foreign project', 123.45, 'USD')`;
    await sql`insert into tasks (id, workspace_id, project_id, owner_id, worker_id,
      parent_id, title, number, status, due_at, archived_at)
      values (${rootTask}, ${workspace}, ${project}, ${admins}, null, null,
              'Plan · 規劃', 1, 'in_progress', '2099-01-02T03:30:00.123Z', null),
             (${childTask}, ${workspace}, ${project}, ${member}, ${worker}, ${rootTask},
              'Deliver · 交付', 2, 'needs_review', '2099-01-03T02:15:00.901Z', null),
             (${unscheduled}, ${workspace}, ${project}, ${admins}, null, null,
              'Unscheduled', 3, 'todo', null, null),
             (${archived}, ${workspace}, ${project}, ${admins}, null, null,
              'Archived task', 4, 'done', null, '2099-01-02T00:00:00Z')`;
    await sql`insert into task_plans (id, workspace_id, start_date, duration_days)
      values (${rootTask}, ${workspace}, '2099-01-01', 2)`;
    await sql`insert into milestones (id, workspace_id, project_id, name, date, archived_at, created_at, updated_at)
      values (${milestoneTie}, ${workspace}, ${project}, 'Same-day milestone', '2099-01-03', null,
              '2026-01-01T00:00:00.126Z', '2026-02-01T22:00:00.513Z'),
             (${milestone}, ${workspace}, ${project}, 'Launch · 發布', '2099-01-03', null,
              '2026-01-01T00:00:00.125Z', '2026-02-01T22:00:00.512Z'),
             (${hiddenMilestone}, ${workspace}, ${project}, 'Archived milestone', '2099-01-02',
              '2099-01-02T00:00:00Z', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')`;
    await sql`insert into task_dependencies (id, workspace_id, predecessor_task_id, successor_task_id, created_at)
      values (${fixtureId(30)}, ${workspace}, ${rootTask}, ${childTask}, '2026-01-02T07:00:00.333Z')`;
    await sql`insert into task_dependencies (id, workspace_id, predecessor_task_id, successor_milestone_id, created_at)
      values (${fixtureId(31)}, ${workspace}, ${childTask}, ${milestone}, '2026-01-02T07:00:00.334Z')`;
    await sql`insert into project_payments (id, workspace_id, project_id, amount, paid_on, note, created_by, created_at, updated_at)
      values (${fixtureId(40)}, ${workspace}, ${project}, 42.68, '2099-01-02', 'Deposit',
              ${admins}, '2026-01-04T00:00:00.250Z', '2026-01-04T00:00:00.250Z'),
             (${fixtureId(41)}, ${workspace}, ${project}, 13.07, '2099-01-01', 'First payment',
              ${admins}, '2026-01-05T00:00:00.251Z', '2026-01-05T00:00:00.251Z'),
             (${fixtureId(42)}, ${workspace}, ${project}, 0.29, '2099-01-02', 'Same day',
              ${admins}, '2026-01-04T00:00:00.251Z', '2026-01-04T00:00:00.251Z')`;
  });
}

function normalize(value: Json): Json {
  if (typeof value === "string") {
    const instant =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
        value,
      );
    if (!instant) return value;
    const ticks = Date.parse(instant[1] + instant[3]);
    if (!Number.isFinite(ticks)) return value;
    const utc = new Date(ticks).toISOString().replace(/\.000Z$/, "");
    const precision = instant[2]?.replace(/0+$/, "");
    return `${utc}${precision ? `.${precision}` : ""}Z`;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  return value;
}

function firstDifference(
  a: Json | undefined,
  b: Json | undefined,
  at = "",
): string | undefined {
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
      const mismatch = firstDifference(a[index], b[index], `${at}/${index}`);
      if (mismatch !== undefined) return mismatch;
    }
    return;
  }
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    for (const key of [
      ...new Set([...Object.keys(a), ...Object.keys(b)]),
    ].sort()) {
      const mismatch = firstDifference(
        a[key],
        b[key],
        `${at}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
      );
      if (mismatch !== undefined) return mismatch;
    }
    return;
  }
  return at;
}

async function read(origin: string, path: string, cookie?: string) {
  const response = await fetch(origin + path, {
    headers: cookie ? { Cookie: cookie } : undefined,
    signal: AbortSignal.timeout(5000),
    redirect: "manual",
  });
  return {
    status: response.status,
    body: normalize((await response.json().catch(() => null)) as Json),
  };
}

async function main(binary: string) {
  accessSync(binary, constants.X_OK);
  const originDb = testDatabase();
  const admin = connectDatabase(originDb.href);
  const databaseName = `taff_timeline_${randomUUID().replaceAll("-", "")}_test`;
  const targetDb = new URL(originDb);
  targetDb.pathname = "/" + databaseName;
  let created = false;
  let child: ChildProcess | undefined;
  let node: Server | undefined;
  let core: ReturnType<typeof createCore> | undefined;
  let fixture: ReturnType<typeof connectDatabase> | undefined;
  try {
    stage = "creating the disposable database";
    await admin.client`create database ${admin.client(databaseName)} template template0`;
    created = true;
    stage = "applying database migrations";
    await migrateDatabase(targetDb.href);
    stage = "starting the Node baseline";
    fixture = connectDatabase(targetDb.href);
    node = createServer(async (req, res) => {
      try {
        const headers = new Headers();
        if (req.headers.cookie) headers.set("Cookie", req.headers.cookie);
        const response = await app.request(new URL(req.url!, nodeOrigin), {
          headers,
        });
        res.statusCode = response.status;
        if (response.headers.has("Content-Type"))
          res.setHeader("Content-Type", response.headers.get("Content-Type")!);
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(500).end();
      }
    });
    const nodeOrigin = await listen(node);
    core = createCore({
      databaseUrl: targetDb.href,
      authUrl: nodeOrigin,
      authSecret,
      tokenPepper: "timeline-wire-parity-only-pepper",
    });
    const app = createApp(core, nodeOrigin, pino({ enabled: false }), {
      limit: 100,
      hit: async () => ({ allowed: true, count: 1 }),
      close: async () => {},
    });
    const people = {} as Record<Role, Person>;
    stage = "signing in fixture users";
    for (const role of roles) {
      const email = `timeline-parity-${role}@example.test`;
      const data = await core.auth.api.signUpEmail({
        body: { name: `timeline parity ${role}`, email, password },
      });
      const signedIn: Response = await core.auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      assert(signedIn.ok, "fixture sign-in failed");
      const cookie = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .find((value) => value.startsWith("better-auth.session_token="));
      assert(cookie, "fixture sign-in did not establish a session");
      people[role] = { id: data.user.id, cookie };
    }
    stage = "seeding timeline fixtures";
    await seed(fixture, people);
    stage = "starting the Rust candidate";
    const rust = await startRust(binary, targetDb.href, nodeOrigin);
    child = rust.child;
    const mismatches: Array<{
      locale: string;
      role: string;
      route: string;
      at: string;
    }> = [];
    let compared = 0;
    async function compare(
      locale: string,
      role: string,
      route: string,
      id: string,
      status: number,
      cookie?: string,
    ) {
      stage = `comparing ${locale} ${role} ${route}`;
      const paths = `/api/projects/${id}/${route}`;
      const [expected, actual] = await Promise.all([
        read(nodeOrigin, paths, cookie),
        read(rust.origin, paths, cookie),
      ]);
      assert.equal(
        expected.status,
        status,
        `invalid baseline: ${locale} ${role} ${route}`,
      );
      assert.notEqual(expected.body, null, "fixture expected a JSON body");
      const at =
        expected.status === actual.status
          ? firstDifference(expected.body, actual.body, "/body")
          : "/status";
      if (at !== undefined) mismatches.push({ locale, role, route, at });
      compared++;
      return expected.body;
    }
    for (const [locale, tz] of profiles) {
      for (const role of roles) {
        const { cookie } = people[role];
        stage = `setting the ${locale} ${role} fixture profile`;
        const profile = await app.request(new URL("/api/profile", nodeOrigin), {
          method: "PATCH",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            Origin: nodeOrigin,
          },
          body: JSON.stringify({ locale, tz }),
        });
        assert.equal(profile.status, 200, "profile fixture update failed");
        for (const route of routes) {
          const expected =
            role === "foreign" || (role === "guest" && route === "payments")
              ? 403
              : 200;
          const body = await compare(
            locale,
            role,
            route,
            project,
            expected,
            cookie,
          );
          if (expected !== 200) continue;
          if (route === "timeline") {
            assert(body && typeof body === "object" && !Array.isArray(body));
            assert.equal(body.timeZone, tz);
            assert(
              Array.isArray(body.items) && body.items.length === 4,
              "timeline fixture missing active items",
            );
            assert(
              body.risk &&
                typeof body.risk === "object" &&
                !Array.isArray(body.risk),
            );
            assert.deepEqual(
              body.risk.finance,
              role === "guest"
                ? null
                : {
                    contractAmount: "400.73",
                    collectedAmount: "56.04",
                    collectedPercent: 14,
                    currency: "USD",
                  },
            );
          } else {
            assert(
              Array.isArray(body) &&
                body.length === (route === "milestones" ? 2 : 3),
            );
          }
        }
      }
      for (const route of routes) {
        await compare(
          locale,
          "foreign-project",
          route,
          foreignProject,
          403,
          people.admin.cookie,
        );
        await compare(
          locale,
          "malformed",
          route,
          "invalid-project",
          400,
          people.admin.cookie,
        );
        await compare(
          locale,
          "missing",
          route,
          missingProject,
          404,
          people.admin.cookie,
        );
        await compare(locale, "anonymous", route, project, 401);
      }
    }
    console.log(
      JSON.stringify({ compared, routes, profiles, mismatches }, null, 2),
    );
    if (mismatches.length) process.exitCode = 1;
  } finally {
    try {
      const results = await Promise.allSettled([
        child && stopRust(child),
        node && closeServer(node),
        core?.close(),
        fixture?.close(),
      ]);
      if (created)
        await admin.client`drop database ${admin.client(databaseName)}`;
      assert(
        results.every((result) => result.status === "fulfilled"),
        "fixture connections did not close cleanly",
      );
    } finally {
      await admin.close();
    }
  }
}

try {
  assert(
    process.argv.length === 3,
    "usage: timeline-parity.mts /path/to/taff-api",
  );
  await main(resolve(process.argv[2]!));
} catch (error) {
  // Database URLs, bodies, cookie values and server stderr stay in memory.
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  const allowed = /^(ERR_ASSERTION|ENOENT|EACCES|[0-9A-Z]{5})$/;
  console.error(
    `Timeline parity fixture failed while ${stage}.`,
    typeof code === "string" && allowed.test(code) ? code : "",
  );
  process.exitCode = 1;
}
