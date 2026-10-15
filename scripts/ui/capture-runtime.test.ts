import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("plain Node capture CLI loads shared schema helpers before credential validation", () => {
  const result = spawnSync(process.execPath, ["scripts/ui/app-shots.mjs"], {
    env: { ...process.env, DEMO_PASSWORD: "", UI_SCREEN: "all" },
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("DEMO_PASSWORD is required");
  expect(result.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
});
