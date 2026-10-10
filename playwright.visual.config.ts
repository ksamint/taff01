import { defineConfig } from "@playwright/test";
import behavior from "./playwright.config";

if (process.env.UI_SCREEN !== "shell")
  throw new Error("Set UI_SCREEN=shell; other screen ports are still pending.");

export default defineConfig({
  ...behavior,
  testMatch: "**/ui-parity.spec.ts",
  testIgnore: [],
  outputDir: "test-results/ui-parity",
  // References are approved separately in the milestone; this runner must not
  // invent missing baselines. Linux generation requires an explicit CLI override.
  updateSnapshots: "none",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  use: {
    ...behavior.use,
    browserName: "chromium",
    deviceScaleFactor: 1,
    colorScheme: "light",
    timezoneId: "Asia/Shanghai",
  },
  projects: [
    {
      name: "phone-zh-HK",
      use: {
        locale: "zh-HK",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "phone-en",
      use: {
        locale: "en-US",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-zh-HK",
      use: { locale: "zh-HK", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "desktop-en",
      use: { locale: "en-US", viewport: { width: 1280, height: 800 } },
    },
  ],
});
