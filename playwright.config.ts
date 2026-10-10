import { defineConfig, devices } from "@playwright/test";

// Offline emulation and routing reach service-worker fetches only with this
// flag; without it the offline shell test sees the worker fetch the real page.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // Visual baselines run through their explicit viewport/locale configuration.
  testIgnore: "**/ui-parity.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.AUTH_URL, trace: "retain-on-failure" },
  projects: [
    { name: "en", use: { ...devices["Pixel 7"], locale: "en-US" } },
    { name: "zh-CN", use: { ...devices["Pixel 7"], locale: "zh-CN" } },
    { name: "zh-HK", use: { ...devices["Pixel 7"], locale: "zh-HK" } },
  ],
  // One entry per service so Playwright owns each process group and can stop it
  // on teardown. The combined `pnpm dev` runner detaches its children, which
  // survive the runner's SIGKILL and keep `pnpm e2e` from exiting.
  webServer: [
    {
      command: process.env.CI
        ? "node dist/runtime/api/api.mjs"
        : "pnpm --filter @taff/api dev",
      url: `${apiUrl}/api/health`,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: process.env.CI
        ? "pnpm --filter @taff/web start"
        : "pnpm --filter @taff/web dev",
      url: `${process.env.AUTH_URL}/api/health`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
