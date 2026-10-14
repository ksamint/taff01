import type { Contact, ContactLink } from "@taff/schemas/crm";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { initials } from "../initials";
import {
  rolesToastText,
  undoRolesSteps,
  withContactRoles,
  withoutContact,
} from "./crm";
import { inversePatch } from "./tasks";

const now = "2026-10-14T00:00:00.000Z";
function contact(id: string, name: string): Contact {
  return {
    id,
    workspaceId: "w",
    companyId: null,
    name,
    title: "",
    phone: null,
    email: null,
    archivedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
const wong = contact("c-wong", "Wong");
const li = contact("c-li", "李佩欣");
const chan = contact("c-chan", "Chan");
const link = (who: Contact, roles: ContactLink["roles"]): ContactLink => ({
  scope: "task",
  entityId: "t1",
  contactId: who.id,
  roles,
  contact: who,
});
const t = ((key: string, values?: Record<string, string>) =>
  `${key}${values ? JSON.stringify(values) : ""}`) as unknown as TFunction;

describe("task contact cache updates", () => {
  it("adds a link and moves an exclusive role away from its holder", () => {
    const before = [link(wong, ["signoff", "tech"]), link(chan, [])];
    const next = withContactRoles(before, "task", "t1", li, ["signoff"]);
    expect(next.map((item) => [item.contactId, item.roles])).toEqual([
      ["c-wong", ["tech"]],
      ["c-chan", []],
      ["c-li", ["signoff"]],
    ]);
    expect(before[0]!.roles).toEqual(["signoff", "tech"]);
  });
  it("replaces an existing link's roles and keeps shared roles", () => {
    const next = withContactRoles(
      [link(wong, ["decider"]), link(chan, ["decider"])],
      "task",
      "t1",
      chan,
      ["decider", "ops"],
    );
    expect(next.map((item) => item.roles)).toEqual([
      ["decider"],
      ["decider", "ops"],
    ]);
  });
  it("removes a link", () => {
    expect(withoutContact([link(wong, []), link(chan, [])], "c-wong")).toEqual([
      link(chan, []),
    ]);
  });
});

describe("task contact undo", () => {
  const before = [link(wong, ["signoff", "tech"]), link(chan, [])];
  it("removes a new link and the stakeholder it added, then restores the holder", () => {
    const steps = undoRolesSteps(before, "t1", "p1", li, {
      previousRoles: null,
      addedProjectStakeholder: true,
      replaced: [{ role: "signoff", contactId: "c-wong" }],
    });
    expect(
      steps.map((step) => [
        step.method,
        step.scope,
        step.entityId,
        step.contact.id,
        step.method === "PUT" ? step.roles : null,
      ]),
    ).toEqual([
      ["DELETE", "task", "t1", "c-li", null],
      ["DELETE", "project", "p1", "c-li", null],
      ["PUT", "task", "t1", "c-wong", ["signoff", "tech"]],
    ]);
  });
  it("re-PUTs the previous roles of an existing link", () => {
    const steps = undoRolesSteps(before, "t1", "p1", chan, {
      previousRoles: [],
      addedProjectStakeholder: false,
      replaced: [{ role: "signoff", contactId: "c-wong" }],
    });
    expect(
      steps.map((step) => [
        step.method,
        step.contact.id,
        step.method === "PUT" ? step.roles : null,
      ]),
    ).toEqual([
      ["PUT", "c-chan", []],
      ["PUT", "c-wong", ["signoff", "tech"]],
    ]);
  });
  it("names the replaced holder and the new stakeholder in the toast", () => {
    expect(
      rolesToastText(
        t,
        before,
        li,
        {
          previousRoles: null,
          addedProjectStakeholder: true,
          replaced: [{ role: "signoff", contactId: "c-wong" }],
        },
        "Checkout v2",
      ),
    ).toBe(
      [
        'crm.toast.added{"name":"李佩欣"}',
        'crm.toast.roleReplaced{"name":"李佩欣","role":"crm.role.signoff","previous":"Wong"}',
        'crm.toast.addedStakeholder{"name":"李佩欣","project":"Checkout v2"}',
      ].join("crm.toast.separator"),
    );
  });
});

describe("desktop task edits", () => {
  it("undoes with the task's previous field values", () => {
    const task = {
      status: "todo",
      priority: 2,
      projectId: null,
      ownerId: "m1",
    } as unknown as Parameters<typeof inversePatch>[0];
    expect(inversePatch(task, { status: "done", projectId: "p" })).toEqual({
      status: "todo",
      projectId: null,
    });
  });
});

describe("initials", () => {
  it("uses the first CJK character or two Latin initials", () => {
    expect(initials("李佩欣")).toBe("李");
    expect(initials("wong siu ming")).toBe("WS");
    expect(initials("  ")).toBe("?");
  });
});
