import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.AUTH_URL, trace: "retain-on-failure" },
  projects: [
    { name: "en", use: { ...devices["Pixel 7"], locale: "en-US" } },
    { name: "zh-CN", use: { ...devices["Pixel 7"], locale: "zh-CN" } },
  ],
  webServer: {
    command: "pnpm dev",
    url: `${process.env.AUTH_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
