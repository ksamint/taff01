import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  auditHtml,
  auditSourceCommit,
  auditTable,
  manifestServices,
  parseCsv,
  referenceErrors,
} from "./audit-contract.mts";

const sha = auditSourceCommit();
const pinned = (() => {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
})();

describe("archived audit pack (docs/audit)", () => {
  it("maps exactly the six explicit modules", () => {
    expect(new Set(manifestServices())).toEqual(
      new Set(["api", "web", "worker", "core", "db", "schemas"]),
    );
  });

  it("records 49 Drizzle tables, three queue entries and SQL audit triggers", () => {
    expect(
      auditTable("models").filter(
        (row) => row.pattern_id === "taff_drizzle_table",
      ),
    ).toHaveLength(49);
    expect(
      new Set(
        auditTable("routes")
          .filter((row) => row.kind === "job")
          .map((row) => row.path),
      ),
    ).toEqual(new Set(["taff", "daily-digest", "daily-digest-scan"]));
    expect(
      auditTable("audit_points").some(
        (row) => row.pattern_id === "taff_trigger_registration",
      ),
    ).toBe(true);
  });

  it("keeps the review page internal", () => {
    const html = auditHtml();
    expect(html).toContain("noindex");
    expect(html).toContain("ADMIN ONLY");
  });

  // References describe the pinned source, not today's tree. A clone without
  // that commit (fetch it with `git fetch origin <sha>`) skips only this case.
  // snapshot.json records dirty_tree: true. Exactly these rows point at the
  // uncommitted work it was taken from (PR #82's 0039 migration and schema
  // lines), which no commit holds; the former verify.py reports the same 12.
  it.skipIf(!pinned)(
    `resolves every file:line reference in its source commit ${sha.slice(0, 7)}`,
    () => {
      const uncommitted = [
        ...Array(4).fill(
          "models: missing packages/db/migrations/0039_oauth_refresh_history.sql",
        ),
        ...[1625, 1626, 1627, 1630, 1633, 1634, 1635].map(
          (line) => `models: packages/db/src/schema.ts:${line} outside 1..1624`,
        ),
        "audit_points: apps/api/src/index.ts:100 outside 1..97",
      ];
      expect(referenceErrors(sha)).toEqual(uncommitted);
    },
  );

  it("reads quoted CSV fields like Python's csv module", () => {
    expect(parseCsv('a,b\n"x, ""y""",2\r\n"multi\nline",3\n')).toEqual([
      { a: 'x, "y"', b: "2" },
      { a: "multi\nline", b: "3" },
    ]);
  });
});
