import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import {
  renderContract,
  renderersOf,
  root,
  scanRenderers,
  scanSuites,
} from "./test-id-contract.mts";

it("renders every data-testid the e2e, perf and screenshot suites use", () => {
  const rendered = scanRenderers();
  const { testIds } = scanSuites();
  expect(testIds.size).toBeGreaterThan(100);
  for (const id of ["today-heading", "auth-email", "auth-password"])
    expect(testIds.has(id)).toBe(true);
  const missing = [...testIds.keys()].filter(
    (id) => renderersOf(id, rendered).length === 0,
  );
  expect(missing).toEqual([]);
});

it("finds every message key the suites read in all three locales", () => {
  const { messages } = scanSuites();
  for (const locale of ["en", "zh-CN", "zh-HK"]) {
    const catalog = JSON.parse(
      readFileSync(
        path.join(root, `apps/web/locales/${locale}/common.json`),
        "utf8",
      ),
    );
    const missing = [...messages.keys()].filter((key) => {
      let node: unknown = catalog;
      for (const part of key.split(".")) {
        if (part === "*") break;
        node = (node as Record<string, unknown> | undefined)?.[part];
      }
      return node === undefined;
    });
    expect(missing, locale).toEqual([]);
  }
});

it("keeps e2e/support/test-id-contract.md in step with the suites", () => {
  const committed = readFileSync(
    path.join(root, "e2e/support/test-id-contract.md"),
    "utf8",
  );
  // Regenerate with: node node_modules/tsx/dist/cli.mjs scripts/test-id-contract.mts
  expect(committed).toBe(renderContract());
});
