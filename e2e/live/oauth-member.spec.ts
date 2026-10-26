import { createHash, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  agentProfileSchema,
  agentTokenListSchema,
  oauthClientSchema,
} from "../../packages/schemas/src/index";
import {
  inviteRecipient,
  liveSignIn,
  runLabel,
  test,
  trackAgentToken,
  verificationAgent,
} from "./live";

// ADR 0023 on production: a member connects only the agent they supervise,
// within the member scope ceiling. Each operation that issues, extends or
// re-enables access (approve, exchange, refresh, list, revoke, restore) is
// checked with the member, including after the member loses supervision.
// The harness restores the Verification agent's captured profile (supervisor
// included) and revokes the tracked grant; the fresh recipient stays a member.
const REDIRECT = "http://127.0.0.1:33419/callback";

test("a supervising member connects the Verification agent, refreshes, revokes and restores; losing supervision ends the grant", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const { workspace } = await liveSignIn(
    page,
    info.project.metadata.locale as string,
  );
  const agent = await verificationAgent(page, workspace.id);
  const baseline = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  const recipient = await inviteRecipient(browser, page, workspace.id, info);
  try {
    const memberPage: Page =
      recipient.context.pages()[0] ?? (await recipient.context.newPage());
    const member = recipient.context.request;
    const client = oauthClientSchema.parse(
      await (
        await member.post("/api/oauth/register", {
          data: {
            client_name: `Live member ${runLabel()}`,
            redirect_uris: [REDIRECT],
          },
        })
      ).json(),
    );
    const verifier = randomBytes(32).toString("base64url");
    const request = {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      scope: "tasks:read files:write",
    };
    const consent = (scopes: string[]) =>
      member.post("/api/oauth/consent", {
        data: {
          request,
          decision: "approve",
          workspaceId: workspace.id,
          memberId: agent.id,
          scopes,
        },
      });
    const supervise = (supervisorId: string | null) =>
      page.request.patch(`/api/agents/${agent.id}`, {
        data: {
          supervisorId,
          reviewPolicy: baseline.reviewPolicy,
          maxDurationMs: baseline.maxDurationMs,
          maxCostMicros: baseline.maxCostMicros,
        },
      });

    // Approve: refused before the member supervises the agent.
    expect((await consent(["tasks:read"])).status()).toBe(403);
    expect((await supervise(recipient.member.id)).status()).toBe(200);
    // Above the member ceiling is refused, not trimmed.
    expect((await consent(["files:write"])).status()).toBe(403);

    await memberPage.goto(`/oauth/authorize?${new URLSearchParams(request)}`);
    await memberPage.getByTestId("oauth-workspace").selectOption(workspace.id);
    await expect(memberPage.getByTestId("oauth-agent")).toHaveValue(agent.id);
    await expect(
      memberPage.getByTestId("oauth-agent").locator("option"),
    ).toHaveCount(1);
    await expect(
      memberPage.getByTestId("oauth-scope-files:write"),
    ).toBeDisabled();
    await expect(
      memberPage.getByTestId("oauth-scope-locked-files:write"),
    ).toBeVisible();
    let callback: URL | undefined;
    await memberPage.route("http://127.0.0.1:33419/**", (route) => {
      callback = new URL(route.request().url());
      return route.fulfill({ status: 200, body: "ok" });
    });
    await memberPage.getByTestId("oauth-approve").click();
    await expect.poll(() => !!callback?.searchParams.get("code")).toBe(true);

    // Exchange.
    const exchanged = await member.post("/api/oauth/token", {
      form: {
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: callback!.searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
      },
    });
    expect(exchanged.status()).toBe(200);
    let issued = await exchanged.json();
    expect(issued.scope).toBe("tasks:read");
    const mcp = (accessToken: string) =>
      member.post("/mcp", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "context.get", arguments: {} },
        },
      });
    expect((await mcp(issued.access_token)).status()).toBe(200);

    // List: the member sees only grants they approved, including this one.
    const listed = agentTokenListSchema.parse(
      await (
        await member.get(`/api/agent-tokens?workspaceId=${workspace.id}`)
      ).json(),
    );
    const grant = listed.find((row) => row.oauthClientId === client.client_id);
    expect(grant).toBeDefined();
    trackAgentToken(grant!.id);
    for (const row of listed) expect(row.createdBy).toBe(recipient.member.id);

    // Refresh while still supervising.
    const refresh = () =>
      member.post("/api/oauth/token", {
        form: {
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: issued.refresh_token,
        },
      });
    const refreshed = await refresh();
    expect(refreshed.status()).toBe(200);
    issued = await refreshed.json();
    expect((await mcp(issued.access_token)).status()).toBe(200);

    // Revoke from the member's Connected apps, then undo it.
    await memberPage.goto("/orgs");
    await memberPage.getByTestId(`workspace-${workspace.id}`).click();
    await memberPage.goto("/me/mcp");
    await expect(memberPage.getByTestId("mcp-connected-apps")).toBeVisible();
    const card = memberPage
      .getByTestId("token-card")
      .filter({ hasText: client.client_name });
    await card.locator("summary").click();
    await card.getByTestId("token-revoke").click();
    await memberPage.getByTestId("token-confirm").click();
    await expect
      .poll(async () => (await mcp(issued.access_token)).status())
      .toBe(401);
    expect(
      (await member.post(`/api/agent-tokens/${grant!.id}/restore`)).status(),
    ).toBe(200);
    expect((await mcp(issued.access_token)).status()).toBe(200);

    // A member who lost supervision cannot undo their own revocation (v0.2.13);
    // once supervising again, they can.
    const restore = () => member.post(`/api/agent-tokens/${grant!.id}/restore`);
    expect(
      (await member.delete(`/api/agent-tokens/${grant!.id}`)).status(),
    ).toBe(200);
    expect((await supervise(baseline.supervisorId)).status()).toBe(200);
    expect((await restore()).status()).toBe(403);
    expect((await supervise(recipient.member.id)).status()).toBe(200);
    expect((await restore()).status()).toBe(200);
    expect((await mcp(issued.access_token)).status()).toBe(200);

    // Losing supervision ends an active grant at the next refresh. That
    // revocation is the agent's, so no person can undo it.
    expect((await supervise(baseline.supervisorId)).status()).toBe(200);
    const denied = await refresh();
    expect(denied.status()).toBe(400);
    expect((await denied.json()).error).toBe("invalid_grant");
    expect((await mcp(issued.access_token)).status()).toBe(401);
    expect((await restore()).status()).toBe(409);
    info.annotations.push({
      type: "check",
      description:
        "ok|member-supervisor OAuth approve/exchange/list/refresh/revoke/restore and loss of supervision",
    });
  } finally {
    await recipient.context.close();
  }
});
