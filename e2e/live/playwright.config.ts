import { defineConfig, devices } from "@playwright/test";

if (
  !(globalThis as { __TAFF_ARTIFACT_GUARD__?: boolean }).__TAFF_ARTIFACT_GUARD__
)
  throw new Error("Use e2e/live/run.mjs to suppress raw live artifacts");
if (process.env.DEBUG || process.env.PWDEBUG || process.env.DEBUG_FILE)
  throw new Error("Debug logging is forbidden for public verification");
if (process.env.RELEASE_BASE_URL !== "https://taff.apuch.cn")
  throw new Error("Set RELEASE_BASE_URL explicitly to https://taff.apuch.cn");
const milestoneFiles = [
  "crm.spec.ts",
  "timeline.spec.ts",
  "brief.spec.ts",
  "mind.spec.ts",
];
const phone = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };
const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 800 },
};
export default defineConfig({
  testDir: ".",
  testMatch: [
    "release/checklist.spec.ts",
    "platform.spec.ts",
    ...milestoneFiles,
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  outputDir: "../../test-results/live",
  reporter: [["./reporter.ts"]],
  use: {
    baseURL: process.env.RELEASE_BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
    ignoreHTTPSErrors: false,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "phone-en",
      use: { ...phone, locale: "en-US" },
      metadata: { locale: "en", formFactor: "phone" },
      grepInvert: /desktop shows the brief as the Me tab/,
    },
    {
      name: "phone-zh-HK",
      use: { ...phone, locale: "zh-HK" },
      metadata: { locale: "zh-HK", formFactor: "phone" },
      grepInvert: /desktop shows the brief as the Me tab/,
    },
    {
      name: "desktop-en",
      use: { ...desktop, locale: "en-US" },
      metadata: { locale: "en", formFactor: "desktop" },
      grepInvert: /phone brief overlay matches the API/,
    },
    {
      name: "desktop-zh-HK",
      use: { ...desktop, locale: "zh-HK" },
      metadata: { locale: "zh-HK", formFactor: "desktop" },
      grepInvert: /phone brief overlay matches the API/,
    },
    {
      name: "phone-zh-CN",
      testMatch: milestoneFiles,
      use: { ...phone, locale: "zh-CN" },
      metadata: { locale: "zh-CN", formFactor: "phone" },
      grepInvert: /desktop shows the brief as the Me tab/,
    },
    {
      name: "desktop-zh-CN",
      testMatch: milestoneFiles,
      use: { ...desktop, locale: "zh-CN" },
      metadata: { locale: "zh-CN", formFactor: "desktop" },
      grepInvert: /phone brief overlay matches the API/,
    },
  ],
});
