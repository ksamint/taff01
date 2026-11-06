import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

// ADR 0030: TypeScript and Rust are the only source languages.
const forbidden =
  /\.(js|mjs|cjs|jsx|py|sh|bash|rb|go|java|kt|php|pl|lua|swift|cs)$/;
const vendoredDocs = /^docs\/ui\/prototype(-v2)?\//;
// Remove a path here in the same commit that ports it; this list only shrinks.
const pendingPythonPorts = new Set([
  "docs/audit/verify.py",
  "e2e/live/email-proof.py",
  "scripts/deploy/neighbor_preservation.py",
  "scripts/deploy/test_neighbor_preservation.py",
  "scripts/ui/subset-fonts.py",
]);

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

test("tracked sources are TypeScript or Rust, apart from recorded ports", () => {
  const violations = tracked().filter(
    (path) =>
      forbidden.test(path) &&
      !vendoredDocs.test(path) &&
      !pendingPythonPorts.has(path),
  );
  expect(violations).toEqual([]);
});

test("no owned JavaScript remains, including configuration", () => {
  const javascript = tracked().filter(
    (path) => /\.(js|mjs|cjs|jsx)$/.test(path) && !vendoredDocs.test(path),
  );
  expect(javascript).toEqual([]);
});

test("every recorded Python port still exists until it is removed from the list", () => {
  const files = new Set(tracked());
  expect([...pendingPythonPorts].filter((path) => !files.has(path))).toEqual(
    [],
  );
});
