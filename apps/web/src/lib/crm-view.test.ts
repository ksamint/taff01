import type { Company, Contact } from "@taff/schemas/crm";
import { describe, expect, it } from "vitest";
import {
  companyMatches,
  contactMatches,
  groupContactLinks,
  isExternal,
  linkHref,
  validateContactFields,
} from "./crm-view";

const now = "2026-10-14T00:00:00.000Z";
const contact: Contact = {
  id: "c1",
  workspaceId: "w",
  companyId: "co1",
  name: "李佩欣",
  title: "Procurement lead",
  phone: "+852 9123 4567",
  email: "pei@example.test",
  archivedAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const company: Company = {
  id: "co1",
  workspaceId: "w",
  name: "Northwind Trading",
  industry: "Retail",
  archivedAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const fields = { name: "Wong", title: "", phone: "", email: "" };

describe("CRM search", () => {
  it("matches a contact by name, title, company, phone or email", () => {
    expect(contactMatches(contact, "")).toBe(true);
    expect(contactMatches(contact, "佩欣")).toBe(true);
    expect(contactMatches(contact, "PROCUREMENT")).toBe(true);
    expect(contactMatches(contact, "northwind", company.name)).toBe(true);
    expect(contactMatches(contact, "9123")).toBe(true);
    expect(contactMatches(contact, "example.test")).toBe(true);
    expect(contactMatches(contact, "acme", company.name)).toBe(false);
  });
  it("ignores hidden details", () => {
    expect(contactMatches({ ...contact, phone: null }, "9123")).toBe(false);
  });
  it("matches a company by name or industry", () => {
    expect(companyMatches(company, " retail ")).toBe(true);
    expect(companyMatches(company, "north")).toBe(true);
    expect(companyMatches(company, "bank")).toBe(false);
  });
});

describe("contact form validation", () => {
  it("accepts a name alone", () => {
    expect(validateContactFields(fields)).toEqual({});
  });
  it("requires a name", () => {
    expect(validateContactFields({ ...fields, name: "  " })).toEqual({
      name: "required",
    });
  });
  it("checks phone and email shapes", () => {
    expect(
      validateContactFields({
        ...fields,
        phone: "+852 (9) 123-4567",
        email: "wong@example.test",
      }),
    ).toEqual({});
    expect(
      validateContactFields({ ...fields, phone: "call me", email: "wong@" }),
    ).toEqual({ phone: "phone", email: "email" });
    expect(validateContactFields({ ...fields, phone: "---" })).toEqual({
      phone: "phone",
    });
  });
  it("limits lengths like the API", () => {
    expect(
      validateContactFields({ ...fields, name: "x".repeat(201) }).name,
    ).toBe("tooLong");
  });
});

describe("contact page links", () => {
  it("groups by scope in company, project, task order", () => {
    const link = (scope: "company" | "project" | "task", entityId: string) => ({
      scope,
      entityId,
      title: entityId,
      projectId: null,
      roles: [],
    });
    expect(
      groupContactLinks([
        link("task", "t1"),
        link("company", "co1"),
        link("task", "t2"),
      ]).map((group) => [group.scope, group.links.length]),
    ).toEqual([
      ["company", 1],
      ["task", 2],
    ]);
  });
  it("links each entity to its screen", () => {
    expect(linkHref({ scope: "company", entityId: "a" })).toBe("/companies/a");
    expect(linkHref({ scope: "project", entityId: "p" })).toBe(
      "/projects/p?view=stakeholders",
    );
    expect(linkHref({ scope: "task", entityId: "t" })).toBe("/tasks/t");
  });
  it("marks stakeholders outside the client company as external", () => {
    expect(isExternal(contact, "co1")).toBe(false);
    expect(isExternal(contact, "co2")).toBe(true);
    expect(isExternal(contact, null)).toBe(false);
  });
});
