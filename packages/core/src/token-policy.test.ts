import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPolicyEnrollment } from "./token-policy";

const token = {
  id: "token",
  name: "Twin",
  organizationPolicy: "all_organizations" as const,
  revokedAt: null,
};
const workspaces = [
  { id: "b", personalOwnerId: null, archivedAt: null },
  { id: "a", personalOwnerId: null, archivedAt: null },
];
describe("policy enrollment planner", () => {
  it("sorts new grants and missing members deterministically", () =>
    expect(
      planPolicyEnrollment({ token, workspaces, grants: [], members: [] }),
    ).toEqual({
      insertGrants: [
        { workspaceId: "a", memberId: null },
        { workspaceId: "b", memberId: null },
      ],
      createMembers: [
        { workspaceId: "a", name: "Twin" },
        { workspaceId: "b", name: "Twin" },
      ],
      revokeGrantIds: [],
    }));
  it("excludes personal workspaces", () =>
    expect(
      planPolicyEnrollment({
        token,
        workspaces: [{ ...workspaces[0], personalOwnerId: "owner" }],
        grants: [],
        members: [],
      }).insertGrants,
    ).toEqual([]));
  it("excludes archived workspaces", () =>
    expect(
      planPolicyEnrollment({
        token,
        workspaces: [{ ...workspaces[0], archivedAt: "now" }],
        grants: [],
        members: [],
      }).insertGrants,
    ).toEqual([]));
  it("preserves revoked tombstones", () =>
    expect(
      planPolicyEnrollment({
        token,
        workspaces,
        grants: [
          { id: "g", workspaceId: "a", origin: "policy", revokedAt: "now" },
        ],
        members: [],
      }).insertGrants.map((g) => g.workspaceId),
    ).toEqual(["b"]));
  it("preserves manual and active grants", () =>
    expect(
      planPolicyEnrollment({
        token,
        workspaces,
        grants: workspaces.map((w) => ({
          id: w.id,
          workspaceId: w.id,
          origin: "manual",
          revokedAt: null,
        })),
        members: [],
      }).insertGrants,
    ).toEqual([]));
  it("reuses only the named agent", () =>
    expect(
      planPolicyEnrollment({
        token,
        workspaces: [workspaces[0]],
        grants: [],
        members: [
          { id: "agent", workspaceId: "b", kind: "agent", name: "Twin" },
        ],
      }).insertGrants,
    ).toEqual([{ workspaceId: "b", memberId: "agent" }]));
  it("reverting revokes only active policy grants", () =>
    expect(
      planPolicyEnrollment({
        token: { ...token, organizationPolicy: "explicit" },
        workspaces,
        grants: [
          { id: "p", workspaceId: "a", origin: "policy", revokedAt: null },
          { id: "m", workspaceId: "b", origin: "manual", revokedAt: null },
          { id: "r", workspaceId: "c", origin: "policy", revokedAt: "now" },
        ],
        members: [],
      }).revokeGrantIds,
    ).toEqual(["p"]));
  it("revoked tokens never enroll", () =>
    expect(
      planPolicyEnrollment({
        token: { ...token, revokedAt: "now" },
        workspaces,
        grants: [],
        members: [],
      }).insertGrants,
    ).toEqual([]));
  it("matches the portable planner golden", () => {
    const cases = JSON.parse(
      readFileSync(
        new URL("./__fixtures__/token-policy-golden.json", import.meta.url),
        "utf8",
      ),
    );
    for (const c of cases)
      expect(planPolicyEnrollment(c.input)).toEqual(c.output);
  });
});
