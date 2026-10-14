import { describe, expect, it } from "vitest";
import { changeEventSchema } from "./index";

const id = "a6c451c0-5a8b-4c30-a2d4-d52cbb528a54";
const event = {
  activityId: id,
  workspaceId: id,
  resourceId: id,
  action: "tasks.insert",
  actorId: `agent:${id}`,
  userId: null,
};
describe("change routing boundaries", () => {
  it("accepts only safe workspace and user routing metadata", () => {
    expect(changeEventSchema.parse(event)).toEqual(event);
    expect(
      changeEventSchema.safeParse({
        ...event,
        workspaceId: null,
        userId: id,
        action: "users.update",
        actorId: id,
      }).success,
    ).toBe(true);
  });
  it.each([
    "suggestions.insert",
    "suggestions.update",
    "mind_nodes.update",
    "mind_edges.delete",
    "mind_sources.insert",
    "mind_node_sources.delete",
  ])("routes the Phase B table change %s", (action) => {
    expect(changeEventSchema.safeParse({ ...event, action }).success).toBe(
      true,
    );
  });
  it.each([
    { token: "secret" },
    { action: "arbitrary.insert" },
    { action: "tasks.drop" },
    { workspaceId: "other" },
    { activityId: "no-id" },
    { actorId: "" },
    { userId: 42 },
  ])(
    "rejects extra secrets, unknown tables and malformed identifiers %j",
    (fields) => {
      expect(changeEventSchema.safeParse({ ...event, ...fields }).success).toBe(
        false,
      );
    },
  );
});
