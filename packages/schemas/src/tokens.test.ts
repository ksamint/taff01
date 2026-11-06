import { describe, expect, it } from "vitest";
import {
  agentTokenWorkspaceSchema,
  oauthDecisionSchema,
  scopeSchema,
  tokenOrganizationPolicyInputSchema,
  tokenOrganizationPolicySchema,
} from "./index";

describe("token organization policy", () => {
  it("accepts only published policy values and a positive version", () => {
    for (const policy of ["explicit", "all_organizations"])
      expect(
        tokenOrganizationPolicyInputSchema.safeParse({ version: 1, policy })
          .success,
      ).toBe(true);
    expect(tokenOrganizationPolicySchema.safeParse("everyone").success).toBe(
      false,
    );
    expect(
      tokenOrganizationPolicyInputSchema.safeParse({
        version: 0,
        policy: "explicit",
      }).success,
    ).toBe(false);
  });
  it("rejects unknown grant origins", () => {
    const grant = {
      id: "00000000-0000-4000-8000-000000000001",
      tokenId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      memberId: "00000000-0000-4000-8000-000000000001",
      grantedBy: "00000000-0000-4000-8000-000000000001",
      scopes: ["tasks:read"],
      origin: "policy",
      revokedAt: null,
      revokedBy: null,
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    };
    expect(agentTokenWorkspaceSchema.safeParse(grant).success).toBe(true);
    expect(
      agentTokenWorkspaceSchema.safeParse({ ...grant, origin: "automatic" })
        .success,
    ).toBe(false);
  });
});

it("accepts every published scope in administrator OAuth consent", () => {
  expect(
    oauthDecisionSchema.safeParse({
      request: {
        response_type: "code",
        client_id: "client",
        redirect_uri: "https://example.test/callback",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
      },
      decision: "approve",
      scopes: scopeSchema.options,
    }).success,
  ).toBe(true);
});
