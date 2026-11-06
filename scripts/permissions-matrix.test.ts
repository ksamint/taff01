import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderPermissionsMatrix } from "./permissions-matrix.mts";

it("published permission matrix matches the live permission rows", () => {
  expect(
    readFileSync(
      new URL("../docs/spec/permissions-matrix.md", import.meta.url),
      "utf8",
    ),
  ).toBe(renderPermissionsMatrix());
});
