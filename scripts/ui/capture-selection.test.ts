import { expect, test } from "vitest";
import {
  assertCapturePaths,
  resolveCaptureSelection,
} from "./capture-selection.mjs";

test("default native capture retains all 26 screens, 106 cases and 128 PNGs", () => {
  const selection = resolveCaptureSelection();
  expect(selection.mode).toBe("all");
  expect(selection.screens).toHaveLength(26);
  expect(selection.expectedCases).toBe(106);
  expect(selection.expectedPngCount).toBe(128);
  expect(new Set(selection.expectedPaths).size).toBe(128);
  expect(selection.expectedPaths).toContain(
    "e2e/__screenshots__/ui-v2.spec.ts/phone-en/fab.png",
  );
  expect(selection.expectedPaths).toContain(
    "e2e/__screenshots__/ui-v2.spec.ts/desktop-en/calendar-month.png",
  );
});

test("date-sensitive partial capture requires exactly all eight source PNGs", () => {
  const selection = resolveCaptureSelection("brief timeline");
  expect(selection.mode).toBe("selected");
  expect(selection.expectedCases).toBe(8);
  expect(selection.expectedPngCount).toBe(8);
  expect(() =>
    assertCapturePaths(selection, selection.expectedPaths),
  ).not.toThrow();
  expect(() =>
    assertCapturePaths(selection, selection.expectedPaths.slice(1)),
  ).toThrow("exactly 8");
  expect(() =>
    assertCapturePaths(selection, [
      ...selection.expectedPaths,
      "unrelated.png",
    ]),
  ).toThrow("exactly 8");
  expect(() =>
    assertCapturePaths(selection, [
      ...selection.expectedPaths.slice(1),
      selection.expectedPaths[1],
    ]),
  ).toThrow("exactly 8");
});

test.each([
  "unknown",
  "brief brief",
  "brief;echo",
  "$(id)",
  "../brief",
  "brief,timeline",
  "brief\ntimeline\nunknown",
])("rejects invalid selection %s before execution", (input) => {
  expect(() => resolveCaptureSelection(input)).toThrow();
});

test("home requires both viewports in all three locales", () => {
  const selection = resolveCaptureSelection("home");
  expect(selection.expectedCases).toBe(6);
  expect(selection.expectedPngCount).toBe(6);
  for (const device of ["phone", "desktop"])
    expect(selection.expectedPaths).toContain(
      `e2e/__screenshots__/ui-v2.spec.ts/${device}-zh-CN/home.png`,
    );
});
