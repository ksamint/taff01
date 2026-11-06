// Only process-owned containers/volumes and an isolated database are faulted.
import assert from "node:assert/strict";
import {
  type ChildProcess,
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { connectDatabase } from "@taff/db";
import { migrateDatabase } from "../../db/src/migrate";

const require = createRequire(resolve("apps/worker/package.json"));
const { Queue } = require("bullmq");
const Redis = require("ioredis");
const prefix = `taff-runtime-faults-${process.pid}`;
const names = [`${prefix}-postgres`, `${prefix}-valkey`];
const volumes = names.map((name) => `${name}-data`);
const out = resolve(".local/audit");
mkdirSync(out, { recursive: true, mode: 0o700 });
const children: ChildProcess[] = [];
const output = new Map<ChildProcess, string>();
const evidence: Record<string, unknown> = {
  prefix,
  startedAt: new Date().toISOString(),
};
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
async function waitFor(check: () => unknown | Promise<unknown>, label: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function port(name: string, internal: string) {
  return Number(docker("port", name, internal).split(":").at(-1));
}
function start(name: "api" | "worker", env: NodeJS.ProcessEnv) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", `apps/${name}/src/index.ts`],
    {
      env: { ...process.env, ...env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(child);
  output.set(child, "");
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) =>
      output.set(child, output.get(child) + String(chunk)),
    );
  return child;
}
async function stop(child: ChildProcess) {
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const [code, signal] = await Promise.race([
    exited,
    delay(28_000, undefined, { ref: false }).then(() => {
      throw new Error("Lifecycle shutdown timed out");
    }),
  ]);
  assert.equal(code, 0, output.get(child) ?? "No child output");
  assert.equal(signal, null);
}
async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((done) => listener.close(() => done()));
  return address.port;
}
const apiPort = await freePort();
const valkeyPort = await freePort();
const origin = `http://127.0.0.1:${apiPort}`;
let db: ReturnType<typeof connectDatabase> | undefined;
let queue: InstanceType<typeof Queue> | undefined;
let redis: InstanceType<typeof Redis> | undefined;
let locked:
  | Awaited<ReturnType<ReturnType<typeof connectDatabase>["client"]["reserve"]>>
  | undefined;
try {
  for (const volume of volumes) docker("volume", "create", volume);
  docker(
    "run",
    "-d",
    "--name",
    names[0],
    "-p",
    "127.0.0.1::5432",
    "-v",
    `${volumes[0]}:/var/lib/postgresql`,
    "-e",
    "POSTGRES_USER=taff",
    "-e",
    "POSTGRES_PASSWORD=fault-test-only",
    "-e",
    "POSTGRES_DB=taff_fault_test",
    "postgres:18-alpine",
  );
  docker(
    "run",
    "-d",
    "--name",
    names[1],
    "-p",
    `127.0.0.1:${valkeyPort}:6379`,
    "-v",
    `${volumes[1]}:/data`,
    "valkey/valkey:9-alpine",
    "valkey-server",
    "--save",
    "",
    "--appendonly",
    "yes",
    "--appendfsync",
    "everysec",
    "--maxmemory",
    "256mb",
    "--maxmemory-policy",
    "noeviction",
  );
  await waitFor(() => {
    try {
      return docker(
        "exec",
        names[0],
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "taff",
        "-d",
        "taff_fault_test",
      ).includes("accepting");
    } catch {
      return false;
    }
  }, "PostgreSQL ready");
  const database = `postgres://taff:fault-test-only@127.0.0.1:${port(names[0], "5432/tcp")}/taff_fault_test`;
  const redisPort = port(names[1], "6379/tcp");
  evidence.ports = {
    postgres: port(names[0], "5432/tcp"),
    valkey: redisPort,
    api: apiPort,
  };
  await migrateDatabase(database);
  db = connectDatabase(database);
  const sql = db.client;
  await sql`create table fault_probe (marker text)`;
  const probe = `
    import assert from 'node:assert/strict';
    import {setTimeout as delay} from 'node:timers/promises';
    import {createRequire} from 'node:module';
    const postgres = process.env.PROBE_CJS
      ? createRequire(import.meta.url)(process.env.PROBE_DRIVER)
      : (await import(process.env.PROBE_DRIVER)).default;
    const sql = postgres(process.env.PROBE_URL, {max: 1, connect_timeout: 2});
    const admin = postgres(process.env.PROBE_URL, {max: 1, connect_timeout: 2});
    let announce, release;
    const ready = new Promise(resolve => { announce = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const ended = sql.begin(async tx => {
      const [{pid}] = await tx\`select pg_backend_pid() as pid\`;
      announce(pid);
      await gate;
      await tx\`insert into fault_probe values ('escaped-after-close')\`;
    }).then(() => 'unexpected commit', error => error.code);
    const pid = await ready;
    await admin\`select pg_terminate_backend(\${pid})\`;
    await delay(100);
    release();
    assert.equal(await ended, 'CONNECTION_CLOSED');
    await delay(100);
    assert.equal(Number((await admin\`select count(*) as n from fault_probe\`)[0].n), 0);
    assert.equal((await sql\`select 1 as alive\`)[0].alive, 1);
    const reserved = await sql.reserve();
    const [{pid: reservedPid}] = await reserved\`select pg_backend_pid() as pid\`;
    await admin\`select pg_terminate_backend(\${reservedPid})\`;
    await delay(100);
    reserved.release();
    reserved.release();
    await assert.rejects(reserved\`select 1\`, error => error.code === 'CONNECTION_CLOSED');
    assert.equal((await sql\`select 1 as alive\`)[0].alive, 1);
    let finished;
    await sql.begin(async tx => { finished = tx; await tx\`select 1\`; });
    await assert.rejects(finished\`insert into fault_probe values ('escaped-after-commit')\`, error => error.code === 'TRANSACTION_ENDED');
    assert.equal(Number((await admin\`select count(*) as n from fault_probe\`)[0].n), 0);
    await Promise.all([sql.end({timeout: 1}), admin.end({timeout: 1})]);
    console.log('transaction blocked after disconnect; pool reusable');
  `;
  if (process.env.FAULT_BASELINE_DRIVER) {
    const baseline = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", probe],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          PROBE_URL: database,
          PROBE_DRIVER: resolve(process.env.FAULT_BASELINE_DRIVER),
          PROBE_CJS: "",
        },
      },
    );
    assert.equal(baseline.status, 1);
    assert.match(baseline.stderr, /Cannot read properties of null.*write/);
    writeFileSync(
      resolve(out, "postgres-baseline-fault.log"),
      baseline.stderr,
      { mode: 0o600 },
    );
    evidence.baselineDriver = "unpatched process exits with null socket write";
  }
  for (const cjs of [false, true]) {
    const result = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", probe],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          PROBE_URL: database,
          PROBE_DRIVER: resolve(
            `packages/db/node_modules/postgres/${cjs ? "cjs/" : ""}src/index.js`,
          ),
          PROBE_CJS: cjs ? "1" : "",
        },
      },
    );
    assert(result.includes("pool reusable"));
  }
  evidence.driverRegression = { esm: "passed", cjs: "passed", escapedRows: 0 };
  const common = {
    DATABASE_URL: `${database}?connect_timeout=2&application_name=${prefix}-api`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    AUTH_URL: origin,
    AUTH_SECRET: "fault-test-only-secret-at-least-32-characters",
    TOKEN_PEPPER: "fault-test-only-pepper-at-least-16",
    API_PORT: String(apiPort),
  };
  const api = start("api", common);
  await waitFor(() => output.get(api)?.includes("API ready"), "API ready");
  const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      name: "Runtime fault recipient",
      email: "fault@example.test",
      password: "fault-test-password-only",
    }),
  });
  assert.equal(signup.status, 200, await signup.clone().text());
  const person = (await signup.json()).user.id as string;
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const get = (signal?: AbortSignal) =>
    fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie }, signal });
  assert.equal((await get()).status, 200);
  const block = async () => {
    locked = await sql.reserve();
    await locked`begin`;
    await locked`lock table users in access exclusive mode`;
  };
  const unblock = async () => {
    if (locked) await locked`rollback`;
    locked?.release();
    locked = undefined;
  };
  const blocked = () =>
    sql<
      { pid: number }[]
    >`select pid from pg_stat_activity where application_name=${`${prefix}-api`} and wait_event_type='Lock'`;
  await block();
  const interrupted = get();
  let pids: { pid: number }[] = [];
  await waitFor(async () => {
    pids = await blocked();
    return pids.length;
  }, "API blocked query");
  for (const { pid } of pids) await sql`select pg_terminate_backend(${pid})`;
  const failed = await interrupted;
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "internal_error" });
  await unblock();
  assert.equal((await get()).status, 200);
  evidence.databaseDisconnect = { status: failed.status, recoveryStatus: 200 };

  await block();
  const abort = new AbortController();
  const abandoned = get(abort.signal).catch((error: Error) => error.name);
  await waitFor(
    async () => (await blocked()).length,
    "slow query before client abort",
  );
  abort.abort();
  assert.equal(await abandoned, "AbortError");
  await unblock();
  await waitFor(
    async () => !(await blocked()).length,
    "aborted query releases after lock release",
  );
  assert.equal((await get()).status, 200);
  evidence.clientAbort = { recovered: true, blockedQueriesAfterRelease: 0 };

  const workerName = `${prefix}-worker`;
  const worker = start("worker", {
    ...common,
    DATABASE_URL: `${database}?connect_timeout=2&application_name=${workerName}`,
  });
  await waitFor(
    () => output.get(worker)?.includes("Worker ready"),
    "worker ready",
  );
  queue = new Queue("taff", {
    connection: { host: "127.0.0.1", port: redisPort, maxRetriesPerRequest: 1 },
  });
  await queue.removeJobScheduler("daily-digest-scan");
  await waitFor(
    async () => (await queue!.getActiveCount()) === 0,
    "initial scan drains",
  );
  redis = new Redis({
    host: "127.0.0.1",
    port: redisPort,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  redis.on("error", () => {});
  await once(redis, "ready");
  await redis.ping();
  const digestZone = new Date().getUTCHours() < 8 ? "Etc/GMT-12" : "UTC";
  await sql.begin(async (tx) => {
    await tx`select set_config('taff.actor_id',${person},true)`;
    await tx`update users set tz=${digestZone} where id=${person}`;
    await tx`update notification_preferences set next_digest_at=now()-interval '1 day',digest_at='08:00' where id=${person}`;
  });
  const [pref] =
    await sql`select next_digest_at,version from notification_preferences where id=${person}`;
  const data = {
    userId: person,
    scheduledAt: new Date(pref.next_digest_at).toISOString(),
    preferenceVersion: pref.version,
  };
  await block();
  const job = await queue.add("daily-digest", data, {
    jobId: "fault-digest",
    attempts: 3,
    backoff: { type: "fixed", delay: 100 },
  });
  await waitFor(
    async () =>
      (
        await sql`select pid from pg_stat_activity where application_name=${workerName} and wait_event_type='Lock'`
      ).length,
    "worker transaction blocked",
  );
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name=${workerName} and wait_event_type='Lock'`;
  await waitFor(
    async () => (await queue!.getJob(job.id)).attemptsMade >= 1,
    "worker retries failed transaction",
  );
  await unblock();
  await waitFor(
    async () =>
      (await queue!.getJob(job.id))
        .getState()
        .then((state: string) => state === "completed"),
    "digest retry completes",
  );
  const duplicates = await queue.add("daily-digest", data, {
    jobId: "fault-digest-replay",
    delay: 1000,
  });
  const mcp = () =>
    fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fault-invalid-token",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });
  docker("stop", names[1]);
  await waitFor(async () => {
    try {
      await redis!.ping();
      return false;
    } catch {
      return true;
    }
  }, "Valkey disconnected");
  const outage = await mcp();
  assert.equal(outage.status, 429);
  docker("start", names[1]);
  await waitFor(async () => {
    try {
      return (await redis!.ping()) === "PONG";
    } catch {
      return false;
    }
  }, "Valkey reconnects");
  await waitFor(
    async () => (await mcp()).status === 401,
    "API limiter reconnects",
  );
  await waitFor(
    async () =>
      (await queue!.getJob(duplicates.id))
        .getState()
        .then((state: string) => state === "completed"),
    "saved job resumes after Valkey outage",
  );
  const [counts] =
    await sql`select (select count(*)::int from daily_digests where user_id=${person}) as digests,(select count(*)::int from inbox_items where digest_id in (select id from daily_digests where user_id=${person})) as inbox`;
  assert.deepEqual(counts, { digests: 1, inbox: 1 });
  evidence.workerRetry = {
    attemptsMade: (await queue.getJob(job.id)).attemptsMade,
    ...counts,
  };
  evidence.valkeyOutage = {
    rejectedStatus: outage.status,
    recoveryStatus: 401,
    savedJobCompleted: true,
  };
  await redis.config("SET", "maxmemory", "1");
  assert.equal((await mcp()).status, 429);
  await assert.rejects(
    queue.add("daily-digest", data, { jobId: "fault-full" }),
    /OOM/,
  );
  assert.equal(
    await (await queue.getJob(duplicates.id)).getState(),
    "completed",
  );
  await redis.config("SET", "maxmemory", "256mb");
  await waitFor(
    async () => (await mcp()).status === 401,
    "API limiter recovers after OOM",
  );
  evidence.valkeyFull = {
    rejectedStatus: 429,
    queueWriteRejected: true,
    savedJobRetained: true,
  };

  await block();
  const active = await queue.add("daily-digest", data, {
    jobId: "fault-shutdown",
  });
  await waitFor(
    async () => (await active.getState()) === "active",
    "job active before stop",
  );
  const workerExit = stop(worker);
  await delay(150);
  assert.equal(worker.exitCode, null, "worker must drain active job");
  await unblock();
  await workerExit;
  await waitFor(
    async () =>
      !(
        await sql`select pid from pg_stat_activity where application_name=${workerName}`
      ).length,
    "worker connections reclaimed",
  );
  await stop(api);
  await waitFor(
    async () =>
      !(
        await sql`select pid from pg_stat_activity where application_name=${`${prefix}-api`}`
      ).length,
    "API connections reclaimed",
  );
  evidence.shutdown = { apiExit: 0, workerExit: 0, reclaimedConnections: true };
  const apiLog = output.get(api) ?? "";
  // The unique user ID is the SQL-parameter canary from the killed auth lookup.
  assert(!apiLog.includes(person), "query parameter leaked into API logs");
  assert(!apiLog.includes("fault@example.test"), "email leaked into API logs");
  assert(
    !apiLog.includes("DrizzleQueryError"),
    "raw query error leaked into API logs",
  );
  evidence.errorLogs = { queryParameterCanaryAbsent: true, emailAbsent: true };
  evidence.result = "passed";
  console.log(JSON.stringify(evidence));
} finally {
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGKILL");
  if (locked) await locked`rollback`.catch(() => {});
  locked?.release();
  await queue?.close();
  redis?.disconnect();
  await db?.close();
  for (let i = 0; i < names.length; i++) {
    try {
      docker("rm", "-f", names[i]);
    } catch {
      /* Not created on early failure. */
    }
    try {
      docker("volume", "rm", volumes[i]);
    } catch {
      /* Not created on early failure. */
    }
  }
  children.forEach((child, i) =>
    writeFileSync(
      resolve(out, `runtime-faults-${i}.log`),
      output.get(child) ?? "",
      { mode: 0o600 },
    ),
  );
  writeFileSync(
    resolve(out, "runtime-faults.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
}
