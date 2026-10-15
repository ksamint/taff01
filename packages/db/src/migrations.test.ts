import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Production deploys accept only additive migrations
 * (docs/agent-goal-deploy-frontend-v2.md, step 2): no DROP, TRUNCATE,
 * DELETE, rename or rewrite of existing data, constraints included. Every
 * Phase B statement must be one of the additive forms below.
 * 0028 is a narrowly checked compatible guard-function repair: it changes no
 * rows or table definitions, retaining 0011 verbatim except for excluding soft archives
 * from the incomplete-child query. Other function replacements stay forbidden.
 */
const PHASE_B = [
  "0024_m17_suggestions_ai.sql",
  "0025_m18_mind_map.sql",
  "0026_m18_mind_edge_version.sql",
  "0027_v021_suggestion_undo.sql",
  "0028_v021_archived_subtask_guard.sql",
];
const ARCHIVED_SUBTASK_GUARD = "0028_v021_archived_subtask_guard.sql";
const ADDITIVE = [
  /^CREATE TABLE "[a-z_]+" \(/,
  /^ALTER TABLE "[a-z_]+" ADD COLUMN "[a-z_]+" [^;]+;$/,
  /^ALTER TABLE "[a-z_]+" ADD CONSTRAINT "[a-z_]+" (FOREIGN KEY|CHECK|UNIQUE) /,
  /^CREATE (UNIQUE )?INDEX "[a-z_]+" ON "[a-z_]+" /,
  /^CREATE TRIGGER [a-z_]+_audit AFTER INSERT OR UPDATE OR DELETE ON [a-z_]+ FOR EACH ROW EXECUTE FUNCTION taff_audit_change\(\);$/,
];
const statements = (file: string) =>
  readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);
const activeChildren = "WHERE parent_id=NEW.id AND status<>'done'";
const historicalGuard = statements("0011_m5_subtask_reopen_guard.sql")[0];
const compatibleGuard = historicalGuard.replace(
  activeChildren,
  "WHERE parent_id=NEW.id AND archived_at IS NULL AND status<>'done'",
);

describe("Phase B migrations are additive", () => {
  it.each(PHASE_B)("%s uses additive statements only", (file) => {
    const list = statements(file);
    expect(list.length).toBeGreaterThan(0);
    for (const statement of list) {
      expect(
        (file === ARCHIVED_SUBTASK_GUARD && statement === compatibleGuard) ||
          ADDITIVE.some((pattern) => pattern.test(statement)),
        statement,
      ).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b/i);
      // DELETE appears only as a foreign-key action or a trigger event.
      expect(
        statement.replace(/ON DELETE|OR DELETE/g, ""),
        statement,
      ).not.toMatch(/\bDELETE\b|\bUPDATE\s+"?[a-z_]+"?\s+SET\b/i);
    }
  });
  it("repairs only the archived-child completion predicate in the existing hierarchy guard", () => {
    expect(historicalGuard.split(activeChildren)).toHaveLength(2);
    expect(statements(ARCHIVED_SUBTASK_GUARD)).toEqual([compatibleGuard]);
    expect(compatibleGuard).toMatch(
      /^CREATE OR REPLACE FUNCTION taff_task_planning_guard\(\)/,
    );
  });
  it("adds a column only with a default when it is NOT NULL", () => {
    for (const file of PHASE_B)
      for (const statement of statements(file))
        if (/ADD COLUMN/.test(statement) && /NOT NULL/.test(statement))
          expect(statement).toMatch(/DEFAULT /);
  });
  it("audits every table it creates", () => {
    for (const file of PHASE_B) {
      const list = statements(file);
      const created = list.flatMap(
        (s) => s.match(/^CREATE TABLE "([a-z_]+)"/)?.[1] ?? [],
      );
      const audited = list.flatMap(
        (s) => s.match(/^CREATE TRIGGER ([a-z_]+)_audit /)?.[1] ?? [],
      );
      expect(audited.sort()).toEqual(created.sort());
    }
  });
});
