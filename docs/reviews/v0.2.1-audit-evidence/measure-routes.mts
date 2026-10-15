import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import { prototypeId } from "../../../packages/schemas/src/prototype-data";
import { lighthouseReport } from "../../../scripts/lighthouse-report";

const base = process.env.AUTH_URL!;
assert(new URL(base).hostname === "localhost");
const out = "/tmp/taff-v021-route-performance-date-aligned";
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "taff-audit-perf-"));
const browser = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ["--remote-debugging-port=0"],
  serviceWorkers: "block",
});
let auditor: any;
const results = [];
try {
  const login = await browser.request.post(base + "/api/auth/sign-in/email", {
    headers: { Origin: base },
    data: {
      email: process.env.DEMO_EMAIL ?? "alex@taff.local",
      password: process.env.DEMO_PASSWORD,
    },
  });
  assert(login.ok());
  const me = await (await browser.request.get(base + "/api/me")).json();
  const workspaceId = prototypeId("workspace", "nw");
  const port = Number(
    (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
      "\n",
    )[0],
  );
  auditor = await createRequire(import.meta.resolve("lighthouse"))(
    "puppeteer-core",
  ).connect({ browserURL: `http://127.0.0.1:${port}` });
  const auditPage = await auditor.newPage();
  await auditPage.setBypassServiceWorker(true);
  const paths = [
    ["Today", "/", '[data-testid="today-heading"]'],
    ["Projects", "/projects", '[data-testid="board-task"]'],
    ["Calendar", "/calendar", '[data-testid="calendar-engine"]'],
    [
      "Timeline",
      `/projects/${prototypeId("project", "nw")}?view=timeline`,
      '[data-testid="timeline-view"]',
    ],
  ];
  const prefs = ({ workspaceId, userId }: any) => {
    sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
    localStorage.setItem("taff:last-workspace", workspaceId);
  };
  await auditPage.evaluateOnNewDocument(prefs, {
    workspaceId,
    userId: me.user.id,
  });
  for (const locale of ["en", "zh-CN", "zh-HK"]) {
    assert(
      (
        await browser.request.patch(base + "/api/profile", {
          headers: { Origin: base },
          data: { locale, tz: "UTC" },
        })
      ).ok(),
    );
    const state = await browser.storageState();
    for (const [name, path, selector] of paths) {
      const values = [];
      for (let i = 0; i < 3; i++) {
        const context = await (
          await chromium.launch({ headless: true })
        ).newContext({
          storageState: state,
          viewport: { width: 393, height: 850 },
          deviceScaleFactor: 2.75,
          isMobile: true,
          hasTouch: true,
          serviceWorkers: "block",
        });
        const b = context.browser()!;
        await context.addInitScript(prefs, { workspaceId, userId: me.user.id });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            downloadThroughput: 1_600_000 / 8,
            uploadThroughput: 750_000 / 8,
            latency: 150,
          });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          await page.addInitScript(() => {
            new PerformanceObserver((list) => {
              (window as any).__lcp = list.getEntries().at(-1)?.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
          });
          await page.goto(base + path, { waitUntil: "load" });
          await page.locator(selector).first().waitFor();
          await page.waitForFunction(
            (lang) => document.documentElement.lang === lang,
            locale === "en"
              ? "en"
              : locale === "zh-CN"
                ? "zh-Hans-CN"
                : "zh-Hant-HK",
          );
          await page.waitForTimeout(3000);
          assert(
            (await page.locator('[data-testid="auth-submit"]').count()) === 0,
          );
          if (name === "Calendar")
            assert(
              (await page.locator(".sx__event").count()) > 0,
              "Calendar fixture events must be rendered",
            );
          values.push(
            Math.round(await page.evaluate(() => (window as any).__lcp)),
          );
        } finally {
          await context.close();
          await b.close();
        }
      }
      await auditPage.goto("about:blank");
      const cdp = await auditPage.createCDPSession();
      await cdp.send("Network.clearBrowserCache");
      await cdp.send("Storage.clearDataForOrigin", {
        origin: base,
        storageTypes: "indexeddb,cache_storage,service_workers",
      });
      await cdp.detach();
      const result = await lighthouse(
        base + path,
        {
          port,
          logLevel: "error",
          formFactor: "mobile",
          throttlingMethod: "devtools",
          disableStorageReset: true,
          onlyCategories: ["performance", "accessibility", "best-practices"],
        },
        undefined,
        auditPage,
      );
      assert(result && !result.lhr.runtimeError);
      assert(
        await auditPage.evaluate(
          (selector) =>
            !!document.querySelector(selector) &&
            !document.querySelector('[data-testid="auth-submit"]'),
          selector,
        ),
      );
      const scores = Object.fromEntries(
        Object.entries(result.lhr.categories).map(([k, v]: any) => [
          k,
          Math.round(v.score * 100),
        ]),
      );
      await writeFile(
        join(out, `${locale}-${name}.json`),
        lighthouseReport(result.lhr, [
          process.env.DEMO_PASSWORD!,
          ...state.cookies.map((c) => c.value),
        ]),
        { mode: 0o600 },
      );
      if (name === "Calendar")
        assert(
          (await auditPage.evaluate(
            () => document.querySelectorAll(".sx__event").length,
          )) > 0,
        );
      const row = {
        locale,
        route: name,
        path,
        seedDate: process.env.SEED_DATE,
        node: process.version,
        scores,
        lcpSamples: values,
        lcpMedian: [...values].sort((a, b) => a - b)[1],
      };
      results.push(row);
      await writeFile(
        join(out, "summary.json"),
        JSON.stringify(results, null, 2),
      );
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await auditor?.disconnect();
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
