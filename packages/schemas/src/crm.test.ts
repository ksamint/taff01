import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTACT_ROLE_RULES,
  contactInputSchema,
  contactLinkInputSchema,
  roleAllowed,
  roleExclusive,
  rolesForScope,
} from "./crm";

describe("CRM role rules", () => {
  it("match the database CHECK contact_roles_scope_role exactly", () => {
    const sql = readFileSync(
      new URL("../../db/migrations/0023_m12_planning_crm.sql", import.meta.url),
      "utf8",
    );
    const check =
      /contact_roles_scope_role" CHECK \(\(scope, role\) IN \((.*)\)\);/.exec(
        sql,
      )?.[1];
    const pairs = [...(check ?? "").matchAll(/\('(\w+)','(\w+)'\)/g)]
      .map((match) => `${match[1]}:${match[2]}`)
      .sort();
    const expected = CONTACT_ROLE_RULES.flatMap((rule) =>
      rule.scopes.map((scope) => `${scope}:${rule.role}`),
    ).sort();
    expect(pairs).toEqual(expected);
  });
  it("keeps chair per company and sign-off per project or task exclusive", () => {
    expect(
      CONTACT_ROLE_RULES.filter((rule) => rule.exclusive).map((r) => r.role),
    ).toEqual(["chair", "signoff"]);
    expect(roleExclusive("chair")).toBe(true);
    expect(roleExclusive("decider")).toBe(false);
  });
  it.each([
    ["chair", "company", true],
    ["chair", "project", false],
    ["broker", "project", true],
    ["broker", "task", false],
    ["signoff", "company", false],
    ["finance", "task", false],
    ["tech", "task", true],
  ] as const)("%s at %s scope is %s", (role, scope, allowed) =>
    expect(roleAllowed(role, scope)).toBe(allowed),
  );
  it("lists roles per scope in table order", () => {
    expect(rolesForScope("task")).toEqual([
      "decider",
      "ops",
      "tech",
      "signoff",
    ]);
  });
  it("rejects duplicate roles and malformed contact email", () => {
    expect(
      contactLinkInputSchema.safeParse({ roles: ["ops", "ops"] }).success,
    ).toBe(false);
    expect(
      contactInputSchema.safeParse({ name: "Wong", email: "nope" }).success,
    ).toBe(false);
    expect(
      contactInputSchema.safeParse({ name: "Wong", email: "" }).success,
    ).toBe(true);
  });
});
