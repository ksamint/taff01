// Audits real signed-in routes on cold production web/API builds.
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
import { lighthouseReport } from "./lighthouse-report";
import {
  type PerformanceRoute,
  performanceFixture,
  performanceMarkers,
} from "./perf-fixture";

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
const route = process.env.PERF_ROUTE ?? "today";
assert(
  ["today", "projects", "calendar", "timeline"].includes(route),
  "Unknown audit route",
);
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
  const path = await performanceFixture(
    context.request,
    origin.origin,
    route as PerformanceRoute,
  );
  const marker = performanceMarkers[route as PerformanceRoute];
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
  const locales = process.env.PERF_LOCALE
    ? [process.env.PERF_LOCALE]
    : ["en", "zh-CN", "zh-HK"];
  assert(
    locales.every((locale) => ["en", "zh-CN", "zh-HK"].includes(locale)),
    "Unknown audit locale",
  );
  for (const locale of locales) {
    phase = `${locale} profile and warm-up`;
    const changed = await context.request.patch(
      `${origin.origin}/api/profile`,
      {
        headers: { Origin: origin.origin },
        data: { locale, tz: "UTC" },
      },
    );
    assert(changed.ok(), "Audit locale update failed");
    const lang =
      locale === "en" ? "en" : locale === "zh-CN" ? "zh-Hans-CN" : "zh-Hant-HK";
    await warm.goto(`${origin.origin}${path}`);
    await warm.getByTestId(marker).waitFor();
    await warm.waitForFunction(
      (value) => document.documentElement.lang === value,
      lang,
    );
    await warm
      .getByText("Today audit task 1", { exact: true })
      .first()
      .waitFor();
    await warm.goto("about:blank");
    await auditPage.goto("about:blank");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Storage.clearDataForOrigin", {
      origin: origin.origin,
      storageTypes: "indexeddb,cache_storage,service_workers,local_storage",
    });
    phase = `${locale} audit`;
    const result = await lighthouse(
      `${origin.origin}${path}`,
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
      "Lighthouse could not audit route",
    );
    const realToday = await auditPage.evaluate(
      (marker) => ({
        lang: document.documentElement.lang,
        today: [...document.querySelectorAll("[data-testid]")].some(
          (element) => element.getAttribute("data-testid") === marker,
        ),
        task: [
          ...document.querySelectorAll(
            "a, [data-testid=timeline-row], .sx__event, .sx__month-grid-event",
          ),
        ].some((link) => link.textContent?.includes("Today audit task 1")),
      }),
      marker,
    );
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
      join(
        reports,
        `${route === "today" ? "" : `${route}-`}${locale}.report.json`,
      ),
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
        route,
        locale,
        cold: true,
        lcpMs: Math.round(
          result.lhr.audits["largest-contentful-paint"].numericValue ?? 0,
        ),
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
    `Lighthouse failed during ${phase} (${error instanceof Error ? error.name : "Error"})${error instanceof Error && "code" in error && error.code === "ERR_ASSERTION" ? `: ${error.message}` : ""}`,
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
