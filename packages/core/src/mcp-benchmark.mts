// Isolated same-host MCP benchmark; never reads production configuration.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { connectDatabase } from "@taff/db";
import { migrateDatabase } from "../../db/src/migrate";
import { createCore, userPrincipal } from "./index";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
function statistics(values: number[]) {
  assert(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}
assert.deepEqual(statistics(Array.from({ length: 100 }, (_, i) => i + 1)), {
  count: 100,
  p50: 50,
  p95: 95,
  p99: 99,
});
if (process.argv.includes("--self-check")) {
  console.log("benchmark percentile self-check passed");
  process.exit(0);
}
const candidate = resolve(process.cwd());
const baseline = resolve(
  process.env.BENCHMARK_BASELINE ?? "../taff01-multi-workspace",
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: baseline,
    encoding: "utf8",
  }).trim(),
  "55718da1637ef92c76b72e1c80f1b531aa9f6a64",
);
const sourceUrl = new URL(process.env.DATABASE_URL!);
assert(["127.0.0.1", "localhost"].includes(sourceUrl.hostname));
assert.equal(sourceUrl.port, "55439");
const redis = new URL(process.env.REDIS_URL!);
assert(["127.0.0.1", "localhost"].includes(redis.hostname));
assert.equal(redis.port, "56389");
const databaseName = `taff_mcp_audit_${Date.now()}_test`;
const admin = connectDatabase(sourceUrl.toString());
await admin.client.unsafe(`create database "${databaseName}"`);
await admin.close();
sourceUrl.pathname = `/${databaseName}`;
await migrateDatabase(sourceUrl.toString());
const auditDb = connectDatabase(sourceUrl.toString());
const privateDir = join(candidate, ".local/audit");
const evidenceDir = join(candidate, "docs/audits");
await mkdir(privateDir, { recursive: true, mode: 0o700 });
await mkdir(evidenceDir, { recursive: true });
const core = createCore({
  databaseUrl: sourceUrl.toString(),
  authUrl: "http://127.0.0.1:3112",
  authSecret: process.env.AUTH_SECRET!,
  tokenPepper: process.env.TOKEN_PEPPER!,
});
const person = await core.auth.api.signUpEmail({
  body: {
    name: "MCP benchmark fixture",
    email: `${randomUUID()}@audit.local`,
    password: randomUUID(),
  },
});
const principal = userPrincipal(person.user.id);
const workspace = (await core.getMe(person.user.id)).workspaces[0];
const agent = (await core.listMembers(principal, workspace.id)).find(
  (member) => member.kind === "agent",
)!;
assert(agent);
const issued = await core.createAgentToken(principal, {
  workspaceId: workspace.id,
  memberId: agent.id,
  name: "Isolated MCP benchmark",
  scopes: ["tasks:read", "tasks:write"],
});
for (let i = 0; i < 2; i++) {
  const extra = await core.createWorkspace(principal, {
    name: `Authorized audit ${i}`,
  });
  const extraAgent = (await core.listMembers(principal, extra.id)).find(
    (member) => member.kind === "agent",
  )!;
  await core.setAgentTokenWorkspace(principal, issued.id, {
    workspaceId: extra.id,
    memberId: extraAgent.id,
    scopes: ["tasks:read"],
  });
}
for (let i = 0; i < 30; i++)
  await core.createWorkspace(principal, { name: `Unrelated audit ${i}` });
for (let i = 0; i < 50; i++)
  await core.createTask(principal, {
    workspaceId: workspace.id,
    ownerId: workspace.memberId,
    workerId: agent.id,
    title: `Benchmark task ${i}`,
  });
await writeFile(
  join(privateDir, "mcp-benchmark-fixture.json"),
  JSON.stringify({
    databaseName,
    workspaceId: workspace.id,
    token: issued.token,
  }),
  { mode: 0o600 },
);
await core.close();
const revisions = ["baseline", "candidate"] as const;
type Revision = (typeof revisions)[number];
const children = {} as Record<Revision, ChildProcess>;
const clients = {} as Record<Revision, Client[]>;
const methods = [
  "tools/list",
  "workspaces.list",
  "context.get",
  "tasks.list",
] as const;
type Method = (typeof methods)[number];
type Sample = {
  revision: Revision;
  method: Method;
  concurrency: number;
  round: number;
  durationMs: number;
  values: number[];
  errors: number;
  rssKb: number;
  connections: unknown;
};
const samples: Sample[] = [];
const soak: Array<Record<string, unknown>> = [];
async function runtimeHash(root: string) {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "-co",
      "--exclude-standard",
      "apps/api/src",
      "apps/shutdown.ts",
      "packages/core/src",
      "packages/db/src",
      "packages/schemas/src",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "package.json",
      "apps/api/package.json",
      "packages/core/package.json",
      "packages/db/package.json",
      "packages/schemas/package.json",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(
      (path) => !path.includes(".test.") && !path.includes("mcp-benchmark.mts"),
    )
    .sort();
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)])
    hash.update(path).update(await readFile(join(root, path)));
  return hash.digest("hex");
}
const runtimeHashes = {
  baseline: await runtimeHash(baseline),
  candidate: await runtimeHash(candidate),
};
const started = new Date().toISOString();
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
async function resource(revision: Revision) {
  const rssKb = Number(
    execFileSync("ps", ["-o", "rss=", "-p", String(children[revision].pid)], {
      encoding: "utf8",
    }).trim(),
  );
  const rows =
    await auditDb.client`select application_name, count(*)::int as total, count(*) filter (where state = 'active')::int as active from pg_stat_activity where datname = ${databaseName} group by application_name`;
  return { rssKb, connections: rows, hostLoadAverage: loadavg() };
}
async function invoke(client: Client, method: Method) {
  if (method === "tools/list") {
    const result = await client.listTools();
    assert(result.tools.some((tool) => tool.name === "workspaces.list"));
  } else {
    const result = await client.callTool({ name: method, arguments: {} });
    assert(!result.isError, `${method} returned an MCP error`);
    assert(Array.isArray(result.content) && result.content.length > 0);
    const block = result.content.find((item) => item.type === "text");
    assert(block && "text" in block && typeof block.text === "string");
    const payload = JSON.parse(block.text);
    if (method === "context.get") {
      assert.equal(payload.workspace.id, workspace.id);
      assert.equal(payload.memberId, agent.id);
    } else {
      assert(Array.isArray(payload));
      assert.equal(payload.length, method === "workspaces.list" ? 3 : 50);
    }
  }
}
async function persist() {
  await writeFile(
    join(privateDir, "mcp-benchmark-raw.json"),
    json({ started, runtimeHashes, databaseName, samples, soak }),
    { mode: 0o600 },
  );
}
try {
  for (const revision of revisions) {
    const cwd = revision === "baseline" ? baseline : candidate;
    const port = revision === "baseline" ? 3111 : 3112;
    const dbUrl = new URL(sourceUrl);
    dbUrl.searchParams.set("application_name", `mcp-audit-${revision}`);
    const log = await open(join(privateDir, `mcp-${revision}.log`), "w", 0o600);
    children[revision] = spawn(
      process.execPath,
      ["--import", "tsx", "apps/api/src/index.ts"],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          DATABASE_URL: dbUrl.toString(),
          REDIS_URL: redis.toString(),
          AUTH_URL: `http://127.0.0.1:${port}`,
          AUTH_SECRET: process.env.AUTH_SECRET,
          TOKEN_PEPPER: process.env.TOKEN_PEPPER,
          API_PORT: String(port),
          API_HOST: "127.0.0.1",
          MCP_RATE_LIMIT: "1000000",
          NODE_ENV: "production",
        },
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    await log.close();
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      healthy = await fetch(`http://127.0.0.1:${port}/api/health`)
        .then((response) => response.ok)
        .catch(() => false);
      if (healthy) break;
      if (children[revision].exitCode !== null)
        throw new Error(`${revision} API exited`);
      await sleep(100);
    }
    assert(healthy, `${revision} API not ready`);
    clients[revision] = [];
    for (let i = 0; i < 30; i++) {
      const client = new Client({
        name: "taff-isolated-benchmark",
        version: "1.0.0",
      });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp`),
          { authProvider: { token: async () => issued.token } },
        ),
      );
      clients[revision].push(client);
    }
    for (const method of methods)
      for (let i = 0; i < 30; i++) await invoke(clients[revision][i], method);
  }
  console.log(
    "Dedicated fixture and both APIs ready; paired benchmark beginning",
  );
  for (let round = 1; round <= 3; round++)
    for (const concurrency of [1, 10, 30])
      for (const method of methods) {
        const collected = {
          baseline: { values: [] as number[], errors: 0, durationMs: 0 },
          candidate: { values: [] as number[], errors: 0, durationMs: 0 },
        };
        // Short counterbalanced blocks reduce nonstationary host-load bias.
        for (let block = 0; block < 5; block++) {
          const order =
            (round + block) % 2 ? revisions : [...revisions].reverse();
          for (const revision of order) {
            let next = 0;
            const begin = performance.now();
            await Promise.all(
              Array.from({ length: concurrency }, async (_, worker) => {
                while (next++ < 60) {
                  const requestStart = performance.now();
                  try {
                    await invoke(clients[revision][worker], method);
                  } catch {
                    collected[revision].errors++;
                  }
                  collected[revision].values.push(
                    performance.now() - requestStart,
                  );
                }
              }),
            );
            collected[revision].durationMs += performance.now() - begin;
          }
        }
        for (const revision of revisions) {
          const sample = {
            revision,
            method,
            concurrency,
            round,
            ...collected[revision],
            ...(await resource(revision)),
          };
          samples.push(sample);
          console.log(
            JSON.stringify({
              revision,
              method,
              concurrency,
              round,
              errors: sample.errors,
              ...statistics(sample.values),
            }),
          );
        }
        await persist();
      }
  // Sustained mixed workload: ten clients, approximately 30 requests/s, for 15 minutes.
  console.log("Candidate 15-minute soak beginning");
  const soakStart = performance.now();
  let minute = 0;
  while (performance.now() - soakStart < 900_000) {
    const begin = performance.now();
    const deadline = Math.min(soakStart + 900_000, begin + 60_000);
    const values: number[] = [];
    let errors = 0;
    await Promise.all(
      Array.from({ length: 10 }, async (_, worker) => {
        let iteration = worker;
        while (performance.now() < deadline) {
          const callStart = performance.now();
          try {
            await invoke(
              clients.candidate[worker],
              methods[iteration++ % methods.length],
            );
          } catch {
            errors++;
          }
          values.push(performance.now() - callStart);
          await sleep(Math.max(0, 334 - (performance.now() - callStart)));
        }
      }),
    );
    const durationMs = performance.now() - begin;
    const sample = {
      minute: ++minute,
      durationMs,
      throughput: (values.length * 1000) / durationMs,
      errors,
      ...statistics(values),
      ...(await resource("candidate")),
    };
    soak.push(sample);
    await persist();
    console.log(JSON.stringify({ phase: "soak", ...sample }));
  }
  const comparison = [1, 10, 30].flatMap((concurrency) =>
    methods.map((method) => {
      const grouped = Object.fromEntries(
        revisions.map((revision) => {
          const matched = samples.filter(
            (sample) =>
              sample.revision === revision &&
              sample.concurrency === concurrency &&
              sample.method === method,
          );
          const values = matched.flatMap((sample) => sample.values);
          return [
            revision,
            {
              ...statistics(values),
              throughput:
                values.length /
                (matched.reduce((sum, sample) => sum + sample.durationMs, 0) /
                  1000),
              errors: matched.reduce((sum, sample) => sum + sample.errors, 0),
              maxRssKb: Math.max(...matched.map((sample) => sample.rssKb)),
            },
          ];
        }),
      ) as Record<
        Revision,
        ReturnType<typeof statistics> & {
          throughput: number;
          errors: number;
          maxRssKb: number;
        }
      >;
      return {
        method,
        concurrency,
        ...grouped,
        p95ChangePercent:
          (grouped.candidate.p95 / grouped.baseline.p95 - 1) * 100,
        pass:
          grouped.candidate.p95 <= grouped.baseline.p95 * 1.1 &&
          grouped.candidate.errors === 0 &&
          grouped.baseline.errors === 0,
      };
    }),
  );
  const runtimeUnchanged =
    runtimeHashes.candidate === (await runtimeHash(candidate));
  const report = {
    started,
    finished: new Date().toISOString(),
    node: process.version,
    baseline: "55718da1637ef92c76b72e1c80f1b531aa9f6a64",
    runtimeHashes,
    runtimeUnchanged,
    fixture: { workspaces: 33, authorizedWorkspaces: 3, tasks: 50 },
    design: {
      rounds: 3,
      callsPerCellPerRound: 300,
      order: "five counterbalanced 60-call blocks per revision per cell/round",
      concurrency: [1, 10, 30],
      rateLimitPerMinute: 1000000,
      queryCount:
        "Not instrumented in timed HTTP path; use workspace-discovery.integration.test.ts query-counter regression",
      database: "Dedicated local disposable PostgreSQL database",
      application:
        "Node --import tsx, same machine, separate loopback child APIs",
      soak: "15 minutes, ten clients, mixed four-method workload, target 30 requests/s",
    },
    comparison,
    soak,
    pass:
      runtimeUnchanged &&
      comparison.every((row) => row.pass) &&
      soak.every((row) => row.errors === 0),
  };
  await writeFile(
    join(evidenceDir, "2026-10-31-mcp-benchmark.json"),
    json(report),
  );
  console.log(
    JSON.stringify({
      complete: true,
      pass: report.pass,
      failingCells: comparison
        .filter((row) => !row.pass)
        .map(({ method, concurrency, p95ChangePercent }) => ({
          method,
          concurrency,
          p95ChangePercent,
        })),
    }),
  );
  if (!report.pass) process.exitCode = 1;
} finally {
  for (const revision of revisions) {
    await Promise.all(
      (clients[revision] ?? []).map((client) => client.close().catch(() => {})),
    );
    children[revision]?.kill("SIGTERM");
  }
  await auditDb.close();
}
