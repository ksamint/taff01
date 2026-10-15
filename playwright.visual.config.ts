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
    "companies",
    "company-detail",
    "contacts",
    "contact-detail",
    "stakeholders",
    "timeline",
    "relations",
    "brief",
    "mind",
    "home",
  ].includes(process.env.UI_SCREEN ?? "")
)
  throw new Error("Set UI_SCREEN to an implemented v2 screen.");

const dark = process.env.UI_THEME === "dark";

export default defineConfig({
  ...behavior,
  webServer: (Array.isArray(behavior.webServer) ? behavior.webServer : []).map(
    (server, index) =>
      index === 0
        ? {
            ...server,
            command: process.env.CI
              ? "node --import ./scripts/ui/visual-clock.mjs dist/runtime/api/api.mjs"
              : "node --env-file=.env --import ./scripts/ui/visual-clock.mjs node_modules/tsx/dist/cli.mjs apps/api/src/index.ts",
            env: { ...server.env, TAFF_VISUAL_API_CLOCK: "ui-v2" },
            reuseExistingServer: false,
          }
        : server,
  ),
  testMatch: "**/ui-v2.spec.ts",
  testIgnore: [],
  outputDir: `test-results/ui-v2/${process.env.UI_SCREEN}`,
  // References are approved separately in the milestone; this runner must not
  // invent missing baselines. Linux generation requires an explicit CLI override.
  updateSnapshots: "none",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  use: {
    ...behavior.use,
    browserName: "chromium",
    deviceScaleFactor: 1,
    colorScheme: dark ? "dark" : "light",
    timezoneId: process.env.UI_SCREEN === "shell" ? "Asia/Shanghai" : "UTC",
  },
  projects: dark
    ? (["phone", "desktop"] as const).flatMap((device) =>
        (["en", "zh-CN", "zh-HK"] as const).map((locale) => ({
          name: `${device}-${locale}-dark`,
          use: {
            locale: locale === "en" ? "en-US" : locale,
            colorScheme: "dark" as const,
            viewport:
              device === "phone"
                ? { width: 390, height: 844 }
                : { width: 1280, height: 800 },
            isMobile: device === "phone",
            hasTouch: device === "phone",
          },
        })),
      )
    : [
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
