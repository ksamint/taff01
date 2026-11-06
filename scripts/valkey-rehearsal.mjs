// Isolated destructive rehearsal: only containers/volumes created by this process.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(resolve("apps/worker/package.json"));
const { Queue, Worker } = require("bullmq");
const Redis = require("ioredis");
const prefix = `taff-valkey-rehearsal-${process.pid}`;
const names = [prefix, `${prefix}-restore`];
const volumes = names.map((name) => `${name}-data`);
const temp = mkdtempSync(join(tmpdir(), `${prefix}-`));
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
let queue;
let redis;
let worker;

async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error("Rehearsal condition timed out");
}
function create(index, appendonly = "yes") {
  docker("volume", "create", volumes[index]);
  docker(
    "create",
    "--name",
    names[index],
    "-p",
    "127.0.0.1::6379",
    "-v",
    `${volumes[index]}:/data`,
    "valkey/valkey:9-alpine",
    "valkey-server",
    "--save",
    "",
    "--appendonly",
    appendonly,
    "--appendfsync",
    "everysec",
    "--maxmemory",
    "256mb",
    "--maxmemory-policy",
    "noeviction",
  );
}
async function connect(index) {
  await waitFor(() => {
    try {
      return docker("exec", names[index], "valkey-cli", "ping") === "PONG";
    } catch {
      return false;
    }
  });
  const port = Number(
    docker("port", names[index], "6379/tcp").split(":").at(-1),
  );
  const connection = { host: "127.0.0.1", port, maxRetriesPerRequest: 1 };
  redis = new Redis(connection);
  queue = new Queue("rehearsal", { connection });
  await queue.waitUntilReady();
  return connection;
}
async function disconnect() {
  await queue?.close();
  queue = undefined;
  redis?.disconnect();
  redis = undefined;
}
async function assertSavedJobs() {
  assert.equal(await (await queue.getJob("waiting-job")).getState(), "waiting");
  assert.equal(await (await queue.getJob("delayed-job")).getState(), "delayed");
  assert.deepEqual((await queue.getJob("waiting-job")).data, {
    evidence: "waiting",
  });
  assert.deepEqual((await queue.getJob("delayed-job")).data, {
    evidence: "delayed",
  });
  assert.equal(await queue.getJobSchedulersCount(), 1);
  assert.equal((await queue.getJobScheduler("scan")).name, "scheduled");
}

try {
  create(0);
  docker("start", names[0]);
  await connect(0);
  await queue.add("waiting", { evidence: "waiting" }, { jobId: "waiting-job" });
  await queue.add(
    "delayed",
    { evidence: "delayed" },
    { jobId: "delayed-job", delay: 60_000 },
  );
  await queue.upsertJobScheduler(
    "scan",
    { every: 1000 },
    { name: "scheduled", data: {} },
  );
  await assertSavedJobs();
  await redis.save();
  docker("cp", `${names[0]}:/data/dump.rdb`, join(temp, "dump.rdb"));
  await disconnect();
  docker("restart", names[0]);
  await connect(0);
  await assertSavedJobs();
  await disconnect();

  // An RDB-only restore must load before enabling AOF; AOF otherwise takes precedence.
  create(1, "no");
  docker("cp", join(temp, "dump.rdb"), `${names[1]}:/data/dump.rdb`);
  docker("start", names[1]);
  const connection = await connect(1);
  await assertSavedJobs();
  await redis.config("SET", "appendonly", "yes");
  await waitFor(async () =>
    /aof_rewrite_in_progress:0/.test(await redis.info("persistence")),
  );
  const info = await redis.info("memory");
  const used = Number(info.match(/^used_memory:(\d+)/m)?.[1]);
  assert.ok(used > 0);
  await redis.config("SET", "maxmemory", String(used + 256 * 1024));
  await assert.rejects(
    redis.set("rehearsal:oom", "x".repeat(2 * 1024 * 1024)),
    /OOM/,
  );
  assert.equal(await redis.get("rehearsal:oom"), null);
  await assertSavedJobs();
  assert.equal(
    (await redis.info("stats")).match(/^evicted_keys:(\d+)/m)?.[1],
    "0",
  );
  await redis.config("SET", "maxmemory", "256mb");
  const processed = new Set();
  let scheduled = 0;
  const errors = [];
  worker = new Worker(
    "rehearsal",
    async (job) => {
      processed.add(job.name);
      if (job.name === "scheduled") scheduled++;
    },
    {
      connection: { ...connection, maxRetriesPerRequest: null },
    },
  );
  worker.on("error", (error) => errors.push(error));
  await (await queue.getJob("delayed-job")).promote();
  await waitFor(
    () =>
      processed.has("waiting") && processed.has("delayed") && scheduled >= 2,
  );
  await worker.close();
  worker = undefined;
  assert.deepEqual(errors, []);
  assert.equal(
    await (await queue.getJob("waiting-job")).getState(),
    "completed",
  );
  assert.equal(
    await (await queue.getJob("delayed-job")).getState(),
    "completed",
  );
  console.log(
    JSON.stringify({
      result: "passed",
      image: "valkey/valkey:9-alpine",
      checks: [
        "AOF restart",
        "RDB restore",
        "waiting job",
        "delayed job",
        "scheduler continuation",
        "OOM rejects write",
        "zero evictions",
      ],
    }),
  );
} finally {
  await worker?.close(true);
  await disconnect();
  for (const name of names) {
    try {
      docker("rm", "-f", name);
    } catch {
      /* May not have been created. */
    }
  }
  for (const volume of volumes) {
    try {
      docker("volume", "rm", volume);
    } catch {
      /* May not have been created. */
    }
  }
  rmSync(temp, { recursive: true, force: true });
}
