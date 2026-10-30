import {
  approvedAgentToolSchemas,
  mcpProjectsEditArgs,
  projectInputSchema,
  projectUpdateSchema,
} from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { type Actor, can } from "./permissions";
import { collectionDelta } from "./planning";

const actor: Actor = {
  id: "agent",
  workspaceId: "workspace",
  kind: "agent",
  role: "member",
  userId: null,
  name: "Agent",
  scopes: ["tasks:read", "tasks:write"],
  permissions: [{ capability: "projects.manage", decision: "allow" }],
};
describe("project delivery trust boundaries", () => {
  it("validates exact decimals, ISO deadline and bounded integer progress across native and MCP schemas", () => {
    expect(
      projectInputSchema.parse({
        name: "Project",
        dueAt: null,
        deliveryProgress: 0,
        contractAmount: "999999999999.99",
        receivedAmount: "0.01",
        currency: "CNY",
      }).contractAmount,
    ).toBe("999999999999.99");
    for (const bad of [
      { deliveryProgress: -1 },
      { deliveryProgress: 101 },
      { deliveryProgress: 1.5 },
      { contractAmount: 1 },
      { receivedAmount: "1e3" },
      { receivedAmount: "-1" },
      { receivedAmount: "0.001" },
      { currency: "cny" },
      { dueAt: "tomorrow" },
    ])
      expect(
        projectInputSchema.safeParse({ name: "Project", ...bad }).success,
      ).toBe(false);
    expect(
      projectUpdateSchema.safeParse({
        version: 1,
        dueAt: null,
        deliveryProgress: 100,
        receivedAmount: "0",
      }).success,
    ).toBe(true);
    expect(
      mcpProjectsEditArgs.safeParse({
        projectId: "11111111-1111-4111-8111-111111111111",
        version: 1,
        deliveryProgress: 100,
      }).success,
    ).toBe(true);
    expect(approvedAgentToolSchemas["projects.create"]).toBe(
      projectInputSchema,
    );
  });
  it("computes collection deltas without floating point or rewriting previous payments", () => {
    expect(collectionDelta("999999999999.99", "999999999999.98")).toBe(1n);
    expect(collectionDelta("0.3", "0.20")).toBe(10n);
    expect(collectionDelta("1.00", "1")).toBe(0n);
    expect(() => collectionDelta("0.19", "0.20")).toThrow();
  });
  it("requires explicit capability and scopes, forbids native direct writes, and revokes financial reads immediately", () => {
    const resource = {
      workspaceId: "workspace",
      approvedProjectOperation: true,
    };
    expect(can(actor, "project:manage", resource)).toBe(true);
    expect(can(actor, "project:manage", { workspaceId: "workspace" })).toBe(
      false,
    );
    expect(can(actor, "finance:read", resource)).toBe(true);
    for (const changed of [
      { permissions: [] },
      { permissions: [{ capability: "projects.manage", decision: "deny" }] },
      { scopes: ["tasks:read"] },
      { scopes: [] },
      { role: "guest" },
      { workspaceId: "other" },
    ] as Partial<Actor>[])
      expect(can({ ...actor, ...changed }, "project:manage", resource)).toBe(
        false,
      );
    expect(
      can({ ...actor, scopes: ["tasks:write"] }, "finance:read", resource),
    ).toBe(false);
    expect(can({ ...actor, permissions: [] }, "finance:read", resource)).toBe(
      false,
    );
    expect(
      can({ ...actor, kind: "person", role: "admin" }, "project:manage", {
        workspaceId: "workspace",
      }),
    ).toBe(true);
  });
});
