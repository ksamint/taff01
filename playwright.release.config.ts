import { defineConfig, devices } from "@playwright/test";

// R1 release checklist (plan §6.0). It runs against an already running stack
// — a local production-mode stack (scripts/release-stack.mjs) or the live
// origin — and never starts servers itself. See docs/deploy.md, "Release
// candidate checks".
const baseURL = process.env.RELEASE_BASE_URL ?? "http://localhost:3000";
const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 800 },
};

export default defineConfig({
  testDir: "./e2e/release",
  testMatch: "checklist.spec.ts",
  fullyParallel: false,
  workers: Number(process.env.RELEASE_WORKERS ?? 1),
  retries: Number(process.env.RELEASE_RETRIES ?? 0),
  timeout: 240_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/release",
  // Traces and screenshots can hold a token shown once on the MCP page, so
  // they stay off unless RELEASE_DEBUG=1 (local stacks only); the report
  // carries the failing step instead.
  use: {
    baseURL,
    trace: process.env.RELEASE_DEBUG ? "retain-on-failure" : "off",
    screenshot: process.env.RELEASE_DEBUG ? "only-on-failure" : "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  reporter: [["list"], ["./e2e/release/reporter.ts"]],
  projects: [
    {
      name: "phone-en",
      use: { ...devices["Pixel 7"], locale: "en-US" },
      metadata: { locale: "en", formFactor: "phone" },
    },
    {
      name: "phone-zh-HK",
      use: { ...devices["Pixel 7"], locale: "zh-HK" },
      metadata: { locale: "zh-HK", formFactor: "phone" },
    },
    {
      name: "desktop-en",
      use: { ...desktop, locale: "en-US" },
      metadata: { locale: "en", formFactor: "desktop" },
    },
    {
      name: "desktop-zh-HK",
      use: { ...desktop, locale: "zh-HK" },
      metadata: { locale: "zh-HK", formFactor: "desktop" },
    },
  ],
});
