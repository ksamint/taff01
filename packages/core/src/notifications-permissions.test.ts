import { describe, expect, it } from "vitest";
import { type Action, type Actor, can, type Resource } from "./permissions";

const person: Actor = {
  id: "member",
  workspaceId: "ws",
  userId: "user",
  kind: "person",
  name: "Person",
  role: "member",
};
describe("notification and digest permissions", () => {
  it.each<[Actor | null, Action, Resource, boolean]>([
    [null, "notification:read", { userId: "user" }, false],
    [person, "notification:read", { userId: "user" }, true],
    [person, "notification:update", { userId: "other" }, false],
    [
      { ...person, role: "guest" },
      "notification:update",
      { userId: "user" },
      true,
    ],
    [
      { ...person, kind: "agent" },
      "notification:read",
      { userId: "user" },
      false,
    ],
    [
      { ...person, kind: "agent" },
      "notification:update",
      { userId: "user" },
      false,
    ],
    [person, "digest:read", { workspaceId: "ws", memberId: "member" }, true],
    [
      { ...person, role: "guest" },
      "digest:read",
      { workspaceId: "ws", memberId: "member" },
      true,
    ],
    [
      { ...person, role: "admin" },
      "digest:read",
      { workspaceId: "ws", memberId: "other" },
      false,
    ],
    [
      person,
      "digest:read",
      { workspaceId: "other", memberId: "member" },
      false,
    ],
    [
      { ...person, kind: "agent" },
      "digest:read",
      { workspaceId: "ws", memberId: "member" },
      false,
    ],
  ])("can(%j,%s,%j) = %s", (actor, action, resource, expected) =>
    expect(can(actor, action, resource)).toBe(expected),
  );
});
