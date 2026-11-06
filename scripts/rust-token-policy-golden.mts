import { mkdirSync, writeFileSync } from "node:fs";
import { planPolicyEnrollment } from "../packages/core/src/token-policy.ts";

const base = {
  token: {
    id: "token",
    name: "Twin",
    organizationPolicy: "all_organizations" as const,
    revokedAt: null,
  },
  workspaces: [{ id: "org", personalOwnerId: null, archivedAt: null }],
  grants: [],
  members: [],
};
const inputs = [
  base,
  {
    ...base,
    grants: [
      {
        id: "revoked",
        workspaceId: "org",
        origin: "policy" as const,
        revokedAt: "2026-11-06T00:00:00Z",
      },
    ],
  },
  {
    ...base,
    token: { ...base.token, organizationPolicy: "explicit" as const },
    grants: [
      {
        id: "active",
        workspaceId: "org",
        origin: "policy" as const,
        revokedAt: null,
      },
    ],
  },
];
const path = new URL(
  "../packages/core/src/__fixtures__/token-policy-golden.json",
  import.meta.url,
);
mkdirSync(new URL("../packages/core/src/__fixtures__/", import.meta.url), {
  recursive: true,
});
writeFileSync(
  path,
  JSON.stringify(
    inputs.map((input) => ({ input, output: planPolicyEnrollment(input) })),
    null,
    2,
  ) + "\n",
);
