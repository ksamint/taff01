// Measures Largest Contentful Paint of the signed-in Today route on the
// production build under a simulated slow 4G phone (Lighthouse mobile profile:
// 1.6 Mbps down, 750 Kbps up, 150 ms RTT, 4x CPU slowdown). Median of runs
// must stay at or below 2000 ms (instruction_v0.md). No Lighthouse needed.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const LIMIT_MS = 2000;
const runs = Number(process.env.LCP_RUNS ?? 3);
// The API trusts AUTH_URL only (CORS and sign-in origin), so the production
// server must answer on that origin; stop a development server on its port.
const origin = process.env.AUTH_URL ?? "http://localhost:3000";
const port = Number(process.env.BUDGET_PORT ?? new URL(origin).port ?? 3000);
const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("DEMO_PASSWORD is required");
const executablePath = process.env.CHROMIUM_PATH;
const locale = process.env.LCP_LOCALE ?? "en";

const server = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  { cwd: "apps/web", env: process.env, stdio: "ignore" },
);
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Production server did not start");
}
async function measure(): Promise<number> {
  const browser = await chromium.launch({ executablePath });
  try {
    const context = await browser.newContext({
      viewport: { width: 393, height: 850 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
      locale: "en-US",
      // A first visit has no service worker; measure that cold path.
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    if (process.env.LCP_DEBUG)
      await page.addInitScript(() => {
        const log: string[] = [];
        (window as unknown as { __lcpLog: string[] }).__lcpLog = log;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const candidate = entry as PerformanceEntry & {
              size: number;
              element?: Element | null;
            };
            log.push(
              `${Math.round(entry.startTime)}ms size ${candidate.size} ${candidate.element?.tagName ?? "?"} ${candidate.element?.textContent?.slice(0, 50) ?? ""}`,
            );
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            log.push(
              `${Math.round(entry.startTime)}ms longtask ${Math.round(entry.duration)}ms`,
            );
        }).observe({ type: "longtask", buffered: true });
        const original = window.fetch;
        window.fetch = (input, init) => {
          const url =
            typeof input === "string" ? input : (input as Request).url;
          if (url.includes("/api/"))
            log.push(
              `${Math.round(performance.now())}ms fetch ${url.replace(location.origin, "")} ${(
                new Error().stack ?? ""
              )
                .split("\n")
                .slice(2, 6)
                .map((line) =>
                  line.trim().replace(location.origin, "").slice(-45),
                )
                .join(" <- ")}`,
            );
          return original(input, init);
        };
      });
    // Sign in at full speed, then measure a cold navigation with the session kept.
    await page.goto(`${origin}/`);
    await page.getByTestId("auth-email").fill(email);
    await page.getByTestId("auth-password").fill(password);
    await page.getByTestId("auth-submit").click();
    await page.getByTestId("today-heading").waitFor();
    // Measure one declared locale rather than whatever the demo account last used.
    const me = (await (await page.request.get(`${origin}/api/me`)).json()) as {
      user: { locale: string; tz: string };
    };
    if (me.user.locale !== locale) {
      const changed = await page.request.patch(`${origin}/api/profile`, {
        data: { locale, tz: me.user.tz },
        headers: { Origin: origin },
      });
      if (!changed.ok()) throw new Error(`Could not set locale ${locale}`);
      await page.reload();
      await page.getByTestId("today-heading").waitFor();
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (process.env.LCP_PROFILE) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    const traceEvents: {
      name: string;
      dur?: number;
      ph: string;
      ts: number;
      args?: { data?: Record<string, unknown> };
    }[] = [];
    if (process.env.LCP_TRACE) {
      cdp.on("Tracing.dataCollected", (event) => {
        traceEvents.push(...(event as { value: typeof traceEvents }).value);
      });
      await cdp.send("Tracing.start", {
        categories: "devtools.timeline,blink.user_timing",
        transferMode: "ReportEvents",
      });
    }
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await page.getByTestId("today-heading").waitFor();
    await page.waitForTimeout(3000);
    if (process.env.LCP_TRACE) {
      const done = new Promise<void>((resolve) =>
        cdp.once("Tracing.tracingComplete", () => resolve()),
      );
      await cdp.send("Tracing.end");
      await done;
      const totals = new Map<string, number>();
      for (const event of traceEvents)
        if (event.ph === "X" && event.dur)
          totals.set(event.name, (totals.get(event.name) ?? 0) + event.dur);
      console.log(
        [...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 14)
          .map(([name, micros]) => `${Math.round(micros / 1000)}ms ${name}`)
          .join("\n"),
      );
      const start = Math.min(
        ...traceEvents
          .filter((event) => event.name === "navigationStart")
          .map((event) => event.ts),
      );
      console.log(
        traceEvents
          .filter(
            (event) =>
              event.ph === "X" &&
              (event.dur ?? 0) > 25_000 &&
              !event.name.startsWith("v8.") &&
              !event.name.startsWith("Background"),
          )
          .sort((a, b) => a.ts - b.ts)
          .map((event) => {
            const data = {
              ...(event.args as { beginData?: Record<string, unknown> })
                ?.beginData,
              ...event.args?.data,
            };
            const detail = [
              data.functionName,
              data.url,
              data.timerId,
              data.dirtyObjects === undefined
                ? undefined
                : `dirty ${data.dirtyObjects}/${data.totalObjects}`,
            ]
              .filter((value) => value !== undefined)
              .map((value) => String(value).replace(origin, "").slice(-50))
              .join(" ");
            return `@${Math.round((event.ts - start) / 1000)}ms ${Math.round((event.dur ?? 0) / 1000)}ms ${event.name} ${detail}`;
          })
          .join("\n"),
      );
    }
    if (process.env.LCP_PROFILE) {
      const { profile } = (await cdp.send("Profiler.stop")) as {
        profile: {
          nodes: {
            id: number;
            callFrame: {
              functionName: string;
              url: string;
              lineNumber: number;
            };
          }[];
          samples: number[];
          timeDeltas: number[];
        };
      };
      const self = new Map<string, number>();
      const byId = new Map(profile.nodes.map((node) => [node.id, node]));
      profile.samples.forEach((id, index) => {
        const node = byId.get(id);
        if (!node) return;
        const frame = node.callFrame;
        const key = `${frame.functionName || "(anonymous)"} ${frame.url.replace(origin, "").slice(-40)}:${frame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
      });
      console.log(
        [...self.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([key, micros]) => `${Math.round(micros / 1000)}ms ${key}`)
          .join("\n"),
      );
    }
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let latest = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) latest = entry.startTime;
          });
          observer.observe({
            type: "largest-contentful-paint",
            buffered: true,
          });
          setTimeout(() => {
            observer.disconnect();
            resolve(latest);
          }, 500);
        }),
    );
    if (process.env.LCP_DEBUG) {
      const timeline = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        const lcpEntry = performance
          .getEntriesByType("largest-contentful-paint")
          .at(-1) as (PerformanceEntry & { element?: Element }) | undefined;
        return {
          document: nav ? Math.round(nav.responseEnd) : null,
          domNodes: document.querySelectorAll("*").length,
          domByTag: Object.fromEntries(
            [...document.querySelectorAll("*")]
              .reduce(
                (counts, node) =>
                  counts.set(
                    node.tagName.toLowerCase(),
                    (counts.get(node.tagName.toLowerCase()) ?? 0) + 1,
                  ),
                new Map<string, number>(),
              )
              .entries(),
          ),
          taskCards: document.querySelectorAll(".task-card").length,
          lcpElement: lcpEntry?.element
            ? `${lcpEntry.element.tagName} ${lcpEntry.element.textContent?.slice(0, 40)}`
            : null,
          resources: performance.getEntriesByType("resource").map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return `${Math.round(resource.startTime)}-${Math.round(resource.responseEnd)} ${Math.round(resource.transferSize / 1024)}K ${resource.name.replace(location.origin, "")}`;
          }),
        };
      });
      console.log(JSON.stringify(timeline, null, 1));
      console.log(
        (
          await page.evaluate(
            () => (window as unknown as { __lcpLog: string[] }).__lcpLog,
          )
        ).join("\n"),
      );
    }
    await context.close();
    return Math.round(lcp);
  } finally {
    await browser.close();
  }
}
try {
  await waitForServer();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const value = await measure();
    samples.push(value);
    console.log(`run ${i + 1}: LCP ${value} ms`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(
    `Today LCP (${locale}) median ${median} ms over ${runs} runs (slow 4G, 4x CPU); limit ${LIMIT_MS} ms`,
  );
  if (median > LIMIT_MS) {
    console.error("LCP budget exceeded");
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
