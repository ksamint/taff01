// Exercises every MCP tool, the rate limit and token revocation against the
// local API with the official v2 client. Run with the dev services up. The
// round trip itself lives in ./mcp-round-trip.ts, shared with the release
// checklist; here the person acts through core.
import { createCore, userPrincipal } from "@taff/core";
import { runMcpOAuthRoundTrip } from "./mcp-oauth-round-trip";
import { ROUND_TRIP_SCOPES, runMcpRoundTrip } from "./mcp-round-trip";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const apiUrl = new URL(
  "/mcp",
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001",
);
const limit = Number(process.env.MCP_RATE_LIMIT ?? 60);
const core = createCore({
  databaseUrl: env("DATABASE_URL"),
  authUrl: env("AUTH_URL"),
  authSecret: env("AUTH_SECRET"),
  tokenPepper: env("TOKEN_PEPPER"),
});
let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  console.log(
    `${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` ${JSON.stringify(detail)}`}`,
  );
  if (!condition) failures++;
}
try {
  const signedIn = await fetch(new URL("/api/auth/sign-in/email", apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: env("AUTH_URL") },
    body: JSON.stringify({
      email: process.env.DEMO_EMAIL ?? "alex@taff.local",
      password: env("DEMO_PASSWORD"),
    }),
  });
  if (!signedIn.ok)
    throw new Error(
      `Demo sign-in failed (${signedIn.status}); run pnpm db:seed first`,
    );
  const person = ((await signedIn.json()) as { user: { id: string } }).user;
  const me = await core.getMe(person.id);
  const workspace = me.workspaces[0];
  const asUser = userPrincipal(person.id);
  const project = await core.createProject(asUser, workspace.id, {
    name: `Smoke-${Date.now()}`,
    stage: "in_service",
    leadId: workspace.memberId,
  });
  const members = await core.listMembers(asUser, workspace.id);
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("The demo workspace has no agent");
  const issued = await core.createAgentToken(asUser, {
    workspaceId: workspace.id,
    memberId: agent.id,
    name: `smoke ${new Date().toISOString()}`,
    scopes: [...ROUND_TRIP_SCOPES],
  });
  await runMcpRoundTrip({
    endpoint: apiUrl,
    token: issued.token,
    agentId: agent.id,
    workspace: { id: workspace.id, memberId: workspace.memberId },
    project,
    rateLimit: limit,
    check,
    revokeToken: async () => {
      await core.revokeAgentToken(asUser, issued.id);
    },
    human: {
      decideGrant: (id, input) => core.decideGrant(asUser, id, input),
      getAgentProfile: (id) => core.getAgentProfile(asUser, id),
      setAgentPermission: (id, input) =>
        core.setAgentPermission(asUser, id, input),
      reviewRun: (id, input) => core.reviewRun(asUser, id, input),
      getReview: (taskId) => core.getReview(asUser, taskId),
      createCompany: (input) => core.createCompany(asUser, workspace.id, input),
      createContact: (input) => core.createContact(asUser, workspace.id, input),
      archiveContact: ({ id, version }) =>
        core.updateContact(asUser, id, { version, archived: true }),
      archiveCompany: ({ id, version }) =>
        core.updateCompany(asUser, id, { version, archived: true }),
      createAgentToken: (input) => core.createAgentToken(asUser, input),
      revokeAgentToken: (id) => core.revokeAgentToken(asUser, id),
      listMcpCalls: () => core.listMcpCalls(asUser, workspace.id),
      getTimeline: (projectId) => core.getTimeline(asUser, projectId),
      dismissSuggestion: (id, input) =>
        core.dismissSuggestion(asUser, id, input),
    },
  });
  // OAuth 2.1 (ADR 0022): the proxy sends AUTH_URL's /api and /.well-known
  // paths to the API, so the smoke routes the public origin to it as well.
  const publicOrigin = new URL(env("AUTH_URL")).origin;
  await runMcpOAuthRoundTrip({
    endpoint: apiUrl,
    check,
    trustAdvertisedResource: true,
    fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin === publicOrigin) url.host = apiUrl.host;
      return fetch(url, init);
    },
    approve: async (authorizationUrl) => {
      const request = Object.fromEntries(authorizationUrl.searchParams);
      const { redirectTo } = await core.oauth.decide(asUser, {
        request: request as never,
        decision: "approve",
        workspaceId: workspace.id,
        memberId: agent.id,
        scopes: ["tasks:read"],
      });
      return redirectTo;
    },
  });
} finally {
  await core.close();
}
if (failures) {
  console.error(`${failures} MCP smoke check(s) failed`);
  process.exit(1);
}
console.log("MCP smoke passed");
