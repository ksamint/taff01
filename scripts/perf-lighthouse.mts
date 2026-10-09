// Audits real signed-in Today pages on the production web/API builds.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import lighthouse, { type Puppeteer } from "lighthouse";
import { meSchema } from "../packages/schemas/src/index";
import { lighthouseReport } from "./lighthouse-report";

const origin = new URL(process.env.AUTH_URL ?? "http://localhost:3000");
const apiOrigin = new URL(
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001",
);
for (const url of [origin, apiOrigin]) {
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "Audit services must be local",
  );
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () => reject(new Error(`Free audit port ${url.port}`)));
    probe.listen(Number(url.port || 80), "127.0.0.1", () =>
      probe.close(() => resolve()),
    );
  });
}
const reports = "lighthouse-reports";
await mkdir(reports, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "taff-lighthouse-"));
const api = spawn("node", ["dist/runtime/api/api.mjs"], {
  env: process.env,
  stdio: "ignore",
});
const web = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "start", "-p", origin.port || "80"],
  {
    cwd: "apps/web",
    env: process.env,
    stdio: "ignore",
  },
);
let context:
  | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
  | undefined;
let auditor: Puppeteer.Browser | undefined;
let phase = "service readiness";
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert(
      api.exitCode === null && web.exitCode === null,
      "Production audit services failed to start",
    );
    try {
      ready = (
        await fetch(`${origin.origin}/api/health`, {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      /* Starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(ready, "Production audit services did not become ready");
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--remote-debugging-port=0"],
    serviceWorkers: "block",
  });
  phase = "signed-in fixture";
  const password = randomUUID();
  const created = await context.request.post(
    `${origin.origin}/api/auth/sign-up/email`,
    {
      headers: { Origin: origin.origin },
      data: {
        email: `lighthouse-${randomUUID()}@example.test`,
        password,
        name: "Lighthouse verification",
      },
    },
  );
  assert(created.ok(), "Audit account could not sign in");
  const me = meSchema.parse(
    await (await context.request.get(`${origin.origin}/api/me`)).json(),
  );
  const workspace = me.workspaces[0];
  assert(workspace, "Audit account needs a workspace");
  for (let index = 0; index < 20; index++) {
    const response = await context.request.post(`${origin.origin}/api/tasks`, {
      headers: { Origin: origin.origin },
      data: {
        workspaceId: workspace.id,
        ownerId: workspace.memberId,
        title: `Today audit task ${index + 1}`,
        priority: (index % 4) + 1,
        dueAt: new Date().toISOString(),
      },
    });
    assert(response.ok(), "Audit task creation failed");
  }
  const port = Number(
    (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
      "\n",
    )[0],
  );
  const puppeteer = createRequire(import.meta.resolve("lighthouse"))(
    "puppeteer-core",
  );
  const connected: Puppeteer.Browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
  });
  auditor = connected;
  const auditPage = await connected.newPage();
  await auditPage.setBypassServiceWorker(true);
  const warm = await context.newPage();
  const cdp = await context.newCDPSession(warm);
  const failures: string[] = [];
  for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
    phase = `${locale} profile and warm-up`;
    const changed = await context.request.patch(
      `${origin.origin}/api/profile`,
      {
        headers: { Origin: origin.origin },
        data: { locale, tz: "Asia/Singapore" },
      },
    );
    assert(changed.ok(), "Audit locale update failed");
    const lang =
      locale === "en" ? "en" : locale === "zh-CN" ? "zh-Hans-CN" : "zh-Hant-HK";
    await warm.goto(origin.origin);
    await warm.getByTestId("today-heading").waitFor();
    await warm.waitForFunction(
      (value) => document.documentElement.lang === value,
      lang,
    );
    await warm
      .getByRole("link", { name: "Today audit task 1", exact: true })
      .waitFor();
    await warm.goto("about:blank");
    await auditPage.goto("about:blank");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Storage.clearDataForOrigin", {
      origin: origin.origin,
      storageTypes: "indexeddb,cache_storage,service_workers",
    });
    phase = `${locale} audit`;
    const result = await lighthouse(
      origin.origin,
      {
        port,
        logLevel: "error",
        formFactor: "mobile",
        // Optional fonts must see the actual mobile download deadline.
        throttlingMethod: "devtools",
        disableStorageReset: true,
        onlyCategories: ["performance", "accessibility", "best-practices"],
      },
      undefined,
      auditPage,
    );
    assert(
      result && !result.lhr.runtimeError,
      "Lighthouse could not audit Today",
    );
    const realToday = await auditPage.evaluate(() => ({
      lang: document.documentElement.lang,
      today: document.querySelector('[data-testid="today-heading"]') !== null,
      task: [...document.querySelectorAll("a")].some(
        (link) => link.textContent === "Today audit task 1",
      ),
    }));
    assert(
      realToday.today && realToday.task && realToday.lang === lang,
      "Lighthouse measured login/loading or the wrong locale",
    );
    const cookies = await connected.cookies();
    const secrets = [
      password,
      process.env.AUTH_SECRET ?? "",
      process.env.TOKEN_PEPPER ?? "",
      ...cookies
        .filter((cookie) => cookie.name !== "taff-locale")
        .map((cookie) => cookie.value),
    ];
    await writeFile(
      join(reports, `${locale}.report.json`),
      lighthouseReport(result.lhr, secrets),
      { mode: 0o600 },
    );
    const scores = Object.fromEntries(
      ["performance", "accessibility", "best-practices"].map((category) => {
        const score = result.lhr.categories[category]?.score;
        assert(
          typeof score === "number" && Number.isFinite(score),
          `Missing ${category} score`,
        );
        if (score < 0.9)
          failures.push(`${locale} ${category}: ${Math.round(score * 100)}`);
        return [category, Math.round(score * 100)];
      }),
    );
    console.log(
      JSON.stringify({
        locale,
        signedIn: true,
        scores,
        lighthouse: result.lhr.lighthouseVersion,
      }),
    );
    await auditPage.goto("about:blank");
  }
  assert(
    failures.length === 0,
    `Lighthouse scores below 90: ${failures.join(", ")}`,
  );
} catch (error) {
  // Playwright transport errors include request cookies in their message and stack.
  console.error(
    `Lighthouse failed during ${phase} (${error instanceof Error ? error.name : "Error"})`,
  );
  process.exitCode = 1;
} finally {
  await auditor?.disconnect();
  await context?.close();
  for (const child of [web, api]) {
    if (child.exitCode !== null) continue;
    child.kill();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  await rm(profile, { recursive: true, force: true });
}
