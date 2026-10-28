import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  memberListSchema,
  meSchema,
  oauthClientSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";

// ADR 0022: an MCP client (as Claude.ai would) registers, sends a signed-out
// admin to the consent page, gets a code back on its redirect URI and uses
// the issued token on /mcp.
test.use({ actionTimeout: 15000 });
const REDIRECT = "http://127.0.0.1:33419/callback";

test("an admin signs in on the consent page, approves an MCP client and the client uses its token", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");

  // The client registers and starts an authorization request (PKCE S256).
  const registered = await page.request.post("/api/oauth/register", {
    data: { client_name: `Claude ${locale}`, redirect_uris: [REDIRECT] },
  });
  expect(registered.status()).toBe(201);
  const client = oauthClientSchema.parse(await registered.json());
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL("/oauth/authorize", process.env.AUTH_URL);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: `state-${locale}`,
    scope: "tasks:read tasks:write",
  }))
    authorize.searchParams.set(key, value);

  // Signed out, the same URL shows sign-in, then the consent screen.
  await page.goto(authorize.toString());
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("oauth-consent")).toBeVisible();
  await expect(page).toHaveURL(authorize.toString());
  await page.goto("/");
  await selectLocale(page, locale);
  await page.goto(authorize.toString());
  await expect(page.getByTestId("oauth-approve")).toHaveText(m.oauth.approve);
  await expect(page.getByTestId("oauth-client")).toContainText(
    `Claude ${locale}`,
  );
  await expect(page.getByTestId("oauth-redirect")).toContainText(
    "127.0.0.1:33419",
  );

  // Choose a fresh organization of this admin, with its own agent.
  const created = await page.request.post("/api/workspaces", {
    data: { name: `OAuth ${locale} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = workspaceSchema.parse(await created.json());
  const agentResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/members`,
    { data: { name: `Claude agent ${locale}`, kind: "agent" } },
  );
  expect(agentResponse.ok()).toBe(true);
  const agent = memberListSchema
    .parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    )
    .find((member) => member.name === `Claude agent ${locale}`);
  if (!agent) throw new Error("The agent was not created");
  await page.reload();
  await page.getByTestId("oauth-workspace").selectOption(workspace.id);
  await expect(page.getByTestId("oauth-agent")).toHaveValue(agent.id);
  await expect(page.getByTestId("oauth-scope-tasks:read")).toBeChecked();
  await expect(page.getByTestId("oauth-scope-tasks:write")).toBeChecked();
  await expect(page.getByTestId("oauth-scope-files:write")).not.toBeChecked();

  // Approving sends the browser to the client's redirect with code and iss.
  let callback: URL | undefined;
  await page.route("http://127.0.0.1:33419/**", (route) => {
    callback = new URL(route.request().url());
    return route.fulfill({ status: 200, body: "ok" });
  });
  await page.getByTestId("oauth-approve").click();
  await expect.poll(() => callback?.searchParams.get("code")).toBeTruthy();
  expect(callback?.searchParams.get("state")).toBe(`state-${locale}`);
  expect(callback?.searchParams.get("iss")).toBe(
    new URL(process.env.AUTH_URL!).origin,
  );

  // The client redeems the code and calls MCP as the chosen agent.
  const token = await page.request.post("/api/oauth/token", {
    form: {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code: callback!.searchParams.get("code")!,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    },
  });
  expect(token.status()).toBe(200);
  const issued = (await token.json()) as {
    access_token: string;
    scope: string;
  };
  expect(issued.scope).toBe("tasks:read tasks:write");
  const context = await page.request.post("/mcp", {
    headers: {
      Authorization: `Bearer ${issued.access_token}`,
      Accept: "application/json, text/event-stream",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "context.get", arguments: {} },
    },
  });
  expect(context.status()).toBe(200);
  const body = await context.text();
  expect(body).toContain(agent.id);

  // The grant appears with the token list on the MCP page, under the client's name.
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  await expect(page.getByTestId(`workspace-${workspace.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/me/mcp");
  await expect(page.getByText(`Claude ${locale}`).first()).toBeVisible();
});

test("an unregistered redirect shows an error and never redirects", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const registered = await page.request.post("/api/oauth/register", {
    data: { client_name: "Probe", redirect_uris: [REDIRECT] },
  });
  const client = oauthClientSchema.parse(await registered.json());
  const authorize = new URL("/oauth/authorize", process.env.AUTH_URL);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "https://evil.example/callback",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
  }))
    authorize.searchParams.set(key, value);
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD!);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  await page.goto(authorize.toString());
  await expect(page.getByTestId("oauth-invalid")).toHaveText(
    messages[locale].oauth.invalid,
  );
  await expect(page).toHaveURL(authorize.toString());
});

test("a member approves only a supervised agent, with locked files scope, and revokes their connected app", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const admin = await freshAccount(page, locale);
  await verifyTestEmail(page, admin.user.id);
  const workspace = admin.workspaces[0]!;
  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    viewport: page.viewportSize(),
  });
  try {
    const memberPage = await context.newPage();
    const email = `oauth-${crypto.randomUUID()}@example.test`;
    const signup = await memberPage.request.post("/api/auth/sign-up/email", {
      headers: { Origin: process.env.AUTH_URL! },
      data: {
        name: "OAuth supervisor",
        email,
        password: process.env.DEMO_PASSWORD,
      },
    });
    expect(signup.status()).toBe(200);
    const me = meSchema.parse(
      await (await memberPage.request.get("/api/me")).json(),
    );
    await verifyTestEmail(memberPage, me.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email, role: "member" },
        })
      ).json(),
    );
    expect(
      (
        await memberPage.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    await memberPage.goto("/");
    await selectLocale(memberPage, locale);
    await memberPage.goto("/orgs");
    await memberPage.getByTestId(`workspace-${workspace.id}`).click();
    const client = oauthClientSchema.parse(
      await (
        await page.request.post("/api/oauth/register", {
          data: {
            client_name: `Member client ${locale}`,
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
    // The personal default is eligible; an unsupervised organization's agents
    // remain absent for its ordinary member.
    await memberPage.goto(`/oauth/authorize?${new URLSearchParams(request)}`);
    await expect(memberPage.getByTestId("oauth-workspace")).toBeVisible();
    await expect(
      memberPage
        .getByTestId("oauth-workspace")
        .locator(`option[value="${workspace.id}"]`),
    ).toHaveCount(0);
    await expect(
      memberPage.getByTestId("oauth-agent").locator("option"),
    ).toHaveText(["默认智能体 / Default agent"]);
    const members = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    const member = members.find((item) => item.userId === me.user.id)!;
    for (const name of ["Supervised", "Other"])
      expect(
        (
          await page.request.post(`/api/workspaces/${workspace.id}/members`, {
            data: { name, kind: "agent" },
          })
        ).status(),
      ).toBe(201);
    const agents = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    const agent = agents.find((item) => item.name === "Supervised")!;
    const other = agents.find((item) => item.name === "Other")!;
    expect(
      (
        await page.request.patch(`/api/agents/${agent.id}`, {
          data: {
            supervisorId: member.id,
            reviewPolicy: "always_review",
            maxDurationMs: null,
            maxCostMicros: null,
          },
        })
      ).status(),
    ).toBe(200);
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
      memberPage.getByTestId("oauth-scope-files:write"),
    ).not.toBeChecked();
    await expect(
      memberPage.getByTestId("oauth-scope-locked-files:write"),
    ).toBeVisible();
    for (const [memberId, scopes] of [
      [other.id, ["tasks:read"]],
      [agent.id, ["files:write"]],
    ] as const)
      expect(
        (
          await memberPage.request.post("/api/oauth/consent", {
            data: {
              request,
              decision: "approve",
              workspaceId: workspace.id,
              memberId,
              scopes,
            },
          })
        ).status(),
      ).toBe(403);
    let callback: URL | undefined;
    await memberPage.route("http://127.0.0.1:33419/**", (route) => {
      callback = new URL(route.request().url());
      return route.fulfill({ status: 200, body: "ok" });
    });
    await memberPage.getByTestId("oauth-approve").click();
    await expect.poll(() => !!callback?.searchParams.get("code")).toBe(true);
    const token = await memberPage.request.post("/api/oauth/token", {
      form: {
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: callback!.searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
      },
    });
    expect(token.status()).toBe(200);
    const issued = await token.json();
    expect(issued.scope).toBe("tasks:read");
    const mcp = () =>
      memberPage.request.post("/mcp", {
        headers: {
          Authorization: `Bearer ${issued.access_token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "context.get", arguments: {} },
        },
      });
    expect((await mcp()).status()).toBe(200);
    await memberPage.goto("/me/mcp");
    await expect(memberPage.getByTestId("mcp-connected-apps")).toBeVisible();
    await expect(memberPage.getByTestId("token-name")).toHaveCount(0);
    await expect(memberPage.locator("#mcp-calls-heading")).toHaveCount(0);
    const card = memberPage
      .getByTestId("token-card")
      .filter({ hasText: `Member client ${locale}` });
    await card.locator("summary").click();
    await card.getByTestId("token-revoke").click();
    await memberPage.getByTestId("token-confirm").click();
    await expect.poll(async () => (await mcp()).status()).toBe(401);
  } finally {
    await context.close();
  }
});
