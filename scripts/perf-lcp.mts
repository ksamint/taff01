// Measures Largest Contentful Paint of the signed-in Today route on the
// production build under a simulated slow 4G phone (Lighthouse mobile profile:
// 1.6 Mbps down, 750 Kbps up, 150 ms RTT, 4x CPU slowdown). Median of runs
// must stay at or below 2000 ms (instruction_v0.md). No Lighthouse needed.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const LIMIT_MS = 2000;
const runs = Number(process.env.LCP_RUNS ?? 3);
const port = Number(process.env.BUDGET_PORT ?? 3106);
const origin = `http://127.0.0.1:${port}`;
const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("DEMO_PASSWORD is required");
const executablePath = process.env.CHROMIUM_PATH;

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
    });
    const page = await context.newPage();
    // Sign in at full speed, then measure a cold navigation with the session kept.
    await page.goto(`${origin}/`);
    await page.getByTestId("auth-email").fill(email);
    await page.getByTestId("auth-password").fill(password);
    await page.getByTestId("auth-submit").click();
    await page.getByTestId("today-heading").waitFor();
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
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await page.getByTestId("today-heading").waitFor();
    await page.waitForTimeout(3000);
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
    `Today LCP median ${median} ms over ${runs} runs (slow 4G, 4x CPU); limit ${LIMIT_MS} ms`,
  );
  if (median > LIMIT_MS) {
    console.error("LCP budget exceeded");
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
