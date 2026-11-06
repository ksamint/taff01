import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportPermissionRows } from "../packages/core/src/permissions.ts";
export function renderPermissionsMatrix() {
  const rows = exportPermissionRows();
  return [
    "# Permissions matrix",
    "",
    "Generated from `can()` by `pnpm exec tsx scripts/permissions-matrix.mts`. Do not edit by hand.",
    "",
    "Baseline: actors share a workspace; people are unrelated to the task owner; the agent is its worker, uses all standard token scopes, default capabilities and always_review, and has no temporary grants. Identity actions target the person's own account. Conditional owner, lead, supervisor, recipient and approved-operation cases remain covered by permissions.test.ts. This table describes baseline decisions, not every possible resource.",
    "",
    "| Action | Admin | Member | Guest | Agent |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.action} | ${[row.admin, row.member, row.guest, row.agent].map((value) => (value ? "Yes" : "No")).join(" | ")} |`,
    ),
    "",
  ].join("\n");
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const target = new URL("../docs/spec/permissions-matrix.md", import.meta.url);
  const content = renderPermissionsMatrix();
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== content)
      throw new Error(
        "Permissions matrix is stale; run pnpm exec tsx scripts/permissions-matrix.mts",
      );
  } else writeFileSync(target, content);
}
