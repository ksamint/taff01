import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Production deploys accept only additive migrations
 * (docs/agent-goal-deploy-frontend-v2.md, step 2): no DROP, TRUNCATE,
 * DELETE, rename or rewrite of existing data, constraints included. Every
 * Phase B statement must be one of the additive forms below.
 */
const PHASE_B = ["0024_m17_suggestions_ai.sql", "0025_m18_mind_map.sql"];
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

describe("Phase B migrations are additive", () => {
  it.each(PHASE_B)("%s uses additive statements only", (file) => {
    const list = statements(file);
    expect(list.length).toBeGreaterThan(0);
    for (const statement of list) {
      expect(
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
