import type { Member } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { type Action, can, type Resource } from "./permissions";

const person: Member = {
  id: "owner",
  workspaceId: "workspace",
  userId: "user",
  name: "Person",
  kind: "person",
  role: "member",
};
describe("permissions", () => {
  it.each<[string, Member | null, Action, Resource, boolean]>([
    [
      "anonymous cannot read",
      null,
      "workspace:read",
      { workspaceId: "workspace" },
      false,
    ],
    [
      "member can read",
      person,
      "workspace:read",
      { workspaceId: "workspace" },
      true,
    ],
    [
      "other workspace denied",
      person,
      "workspace:read",
      { workspaceId: "other" },
      false,
    ],
    [
      "person can create",
      person,
      "task:create",
      { workspaceId: "workspace" },
      true,
    ],
    [
      "agent shares create path",
      { ...person, kind: "agent", userId: null },
      "task:create",
      { workspaceId: "workspace" },
      true,
    ],
    [
      "owner can assign",
      person,
      "task:assign",
      { workspaceId: "workspace", ownerId: "owner" },
      true,
    ],
    [
      "other member cannot assign",
      person,
      "task:assign",
      { workspaceId: "workspace", ownerId: "other" },
      false,
    ],
    [
      "admin can assign",
      { ...person, role: "admin" },
      "task:assign",
      { workspaceId: "workspace", ownerId: "other" },
      true,
    ],
    [
      "admin isolated",
      { ...person, role: "admin" },
      "task:assign",
      { workspaceId: "other", ownerId: "owner" },
      false,
    ],
    ["own profile allowed", person, "profile:update", { userId: "user" }, true],
    [
      "another profile denied",
      person,
      "profile:update",
      { userId: "other" },
      false,
    ],
    [
      "agent cannot change person profile",
      { ...person, kind: "agent", userId: null },
      "profile:update",
      { userId: "user" },
      false,
    ],
  ])("%s", (_, actor, action, resource, allowed) =>
    expect(can(actor, action, resource)).toBe(allowed),
  );
});
