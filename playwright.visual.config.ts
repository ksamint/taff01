import { defineConfig } from "@playwright/test";
import behavior from "./playwright.config";

if (
  ![
    "shell",
    "today",
    "projects",
    "task-detail",
    "review",
    "inbox",
    "calendar",
    "me",
    "type",
    "search",
    "agent",
    "mcp",
    "organizations",
    "team",
    "notifications",
    "quick-add",
  ].includes(process.env.UI_SCREEN ?? "")
)
  throw new Error("Set UI_SCREEN to an implemented parity screen.");

export default defineConfig({
  ...behavior,
  testMatch: "**/ui-parity.spec.ts",
  testIgnore: [],
  outputDir: `test-results/ui-parity/${process.env.UI_SCREEN}`,
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
    timezoneId: process.env.UI_SCREEN === "shell" ? "Asia/Shanghai" : "UTC",
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
