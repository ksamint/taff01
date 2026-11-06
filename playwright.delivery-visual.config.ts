import { defineConfig } from "@playwright/test";

// A local Linux browser connects to an isolated, already running app stack.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "delivery-visual.spec.ts",
  workers: 1,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  updateSnapshots: "none",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  use: {
    baseURL: process.env.AUTH_URL,
    browserName: "chromium",
    connectOptions: process.env.PW_TEST_CONNECT_WS_ENDPOINT
      ? {
          wsEndpoint: process.env.PW_TEST_CONNECT_WS_ENDPOINT,
          exposeNetwork: "<loopback>",
        }
      : undefined,
    serviceWorkers: "block",
    deviceScaleFactor: 1,
    colorScheme: "light",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: (["phone", "desktop"] as const).flatMap((device) =>
    (["en", "zh-CN", "zh-HK"] as const).map((locale) => ({
      name: `${device}-${locale}`,
      use: {
        locale: locale === "en" ? "en-US" : locale,
        viewport:
          device === "phone"
            ? { width: 390, height: 844 }
            : { width: 1280, height: 800 },
        isMobile: device === "phone",
        hasTouch: device === "phone",
      },
    })),
  ),
});
