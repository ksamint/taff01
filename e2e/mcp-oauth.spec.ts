import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  memberListSchema,
  oauthClientSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
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
    .find((member) => member.kind === "agent");
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
