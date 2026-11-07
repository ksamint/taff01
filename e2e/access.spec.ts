import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { setLocalTestSystemAdmin } from "../packages/core/src/testing/system-admin";
import {
  accessMatrixSchema,
  agentProfileSchema,
  issuedAgentTokenSchema,
  issuedWorkspaceInviteSchema,
  memberListSchema,
  meSchema,
  oauthClientSchema,
  oauthRedirectSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { selectLocale } from "./support/preferences";

test("workspace admin edits a capability with Undo and sees the same decision in the agent profile", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  await page.goto("/me/mcp");
  await expect(
    page.locator(".mcp-form").getByText("summaries:read", { exact: true }),
  ).toBeVisible();
  const agent = memberListSchema
    .parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    )
    .find((member) => member.kind === "agent")!;
  const profile = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  const original = profile.permissions.find(
    (item) => item.capability === "web.search",
  )!;
  const next = original.decision === "allow" ? "deny" : "allow";
  await page.goto("/orgs");
  await page.getByTestId("open-access-matrix").click();
  await page.getByRole("tab", { name: m.access.people, exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: m.access.agents, exact: true }),
  ).toBeFocused();
  const row = page.locator(`[data-agent-id="${agent.id}"]`);
  const select = row.locator('select[data-capability="web.search"]');
  await select.selectOption(next);
  await expect(select).toHaveValue(next);
  await page.getByRole("button", { name: m.mcp.undo, exact: true }).click();
  await expect(select).toHaveValue(original.decision);
  await select.selectOption(next);
  await expect(select).toHaveValue(next);
  const region = page.getByRole("region", {
    name: m.access.agents,
    exact: true,
  });
  expect(
    await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await row
      .locator("th")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("sticky");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(`access-phone-${locale}.png`),
    fullPage: true,
  });
  await row.getByRole("link", { name: agent.name, exact: true }).click();
  await expect(
    page.getByTestId(`permission-web.search-${next}`),
  ).toHaveAttribute("aria-pressed", "true");
  const issued = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId: workspace.id,
      memberId: agent.id,
      name: `Matrix grant ${crypto.randomUUID()}`,
      scopes: ["tasks:read"],
    },
  });
  expect(issued.status()).toBe(201);
  const token = issuedAgentTokenSchema.parse(await issued.json());
  try {
    await page.goto("/orgs/access");
    await page.getByRole("tab", { name: m.access.tokens, exact: true }).click();
    const tokenRow = page.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: token.name, exact: true }),
    });
    await expect(tokenRow).toContainText(m.mcp.policy.manual);
    await tokenRow
      .getByRole("button", { name: m.access.explain, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("tasks:read");
    await dialog
      .getByRole("button", { name: m.planning.close, exact: true })
      .click();
    await tokenRow
      .getByRole("button", { name: m.mcp.revokeGrant, exact: true })
      .click();
    await dialog.getByTestId("access-grant-confirm").click();
    await expect(tokenRow).toContainText(m.mcp.revoked);
    await tokenRow
      .getByRole("button", { name: m.mcp.policy.restore, exact: true })
      .click();
    await dialog.getByTestId("access-grant-confirm").click();
    await expect(tokenRow).toContainText(m.mcp.grantActive);
  } finally {
    expect(
      (await page.request.delete(`/api/agent-tokens/${token.id}`)).ok(),
    ).toBe(true);
  }
  await verifyTestEmail(page, me.user.id);
  const redirect = "http://127.0.0.1:33419/callback";
  const client = oauthClientSchema.parse(
    await (
      await page.request.post("/api/oauth/register", {
        data: {
          client_name: `Matrix app ${crypto.randomUUID()}`,
          redirect_uris: [redirect],
        },
      })
    ).json(),
  );
  const verifier = randomBytes(32).toString("base64url");
  const consent = await page.request.post("/api/oauth/consent", {
    data: {
      request: {
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: redirect,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        scope: "tasks:read",
      },
      decision: "approve",
      workspaceId: workspace.id,
      memberId: agent.id,
      scopes: ["tasks:read"],
    },
  });
  expect(consent.status()).toBe(200);
  const callback = new URL(
    oauthRedirectSchema.parse(await consent.json()).redirectTo,
  );
  expect(
    (
      await page.request.post("/api/oauth/token", {
        form: {
          grant_type: "authorization_code",
          client_id: client.client_id,
          code: callback.searchParams.get("code")!,
          redirect_uri: redirect,
          code_verifier: verifier,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/orgs/access");
  await page.getByRole("tab", { name: m.access.apps, exact: true }).click();
  const appRow = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: client.client_name,
      exact: true,
    }),
  });
  await appRow
    .getByRole("button", { name: m.mcp.revokeAccess, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.mcp.confirmRevoke, exact: true })
    .click();
  await expect(appRow).toContainText(m.mcp.revoked);
  expect((await page.request.get("/admin/access")).status()).toBe(404);
});

test("member is refused the workspace matrix after their administrator role is removed", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const admin = await freshAccount(page, locale);
  await verifyTestEmail(page, admin.user.id);
  const workspace = admin.workspaces[0];
  const other = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    viewport: page.viewportSize(),
  });
  try {
    const memberPage = await other.newPage();
    const email = `access-${crypto.randomUUID()}@example.test`;
    expect(
      (
        await memberPage.request.post("/api/auth/sign-up/email", {
          headers: { Origin: process.env.AUTH_URL! },
          data: {
            name: "Access member",
            email,
            password: process.env.DEMO_PASSWORD,
          },
        })
      ).status(),
    ).toBe(200);
    const member = meSchema.parse(
      await (await memberPage.request.get("/api/me")).json(),
    );
    await verifyTestEmail(memberPage, member.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email, role: "admin" },
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
    await memberPage.goto("/orgs/access");
    await expect(
      memberPage.getByRole("tab", { name: m.access.people, exact: true }),
    ).toBeVisible();
    const otherRole = memberPage.getByRole("combobox", {
      name: m.organization.roleFor.replace("{{name}}", admin.user.name),
      exact: true,
    });
    await otherRole.selectOption("member");
    await expect(otherRole).toHaveValue("member");
    await memberPage
      .getByRole("button", { name: m.mcp.undo, exact: true })
      .click();
    await expect(otherRole).toHaveValue("admin");
    const ownRole = memberPage.getByRole("combobox", {
      name: m.organization.roleFor.replace("{{name}}", "Access member"),
      exact: true,
    });
    await ownRole.selectOption("member");
    const dialog = memberPage.getByRole("dialog");
    await expect(dialog).toContainText(m.access.selfDemotionHint);
    await dialog
      .getByRole("button", { name: m.mcp.cancel, exact: true })
      .click();
    await expect(ownRole).toHaveValue("admin");
    await ownRole.selectOption("member");
    await dialog
      .getByRole("button", { name: m.access.confirm, exact: true })
      .click();
    await memberPage.reload();
    await expect(memberPage.getByTestId("access-forbidden")).toHaveText(
      m.errors.forbidden,
    );
    expect(
      (
        await memberPage.request.get(
          `/api/workspaces/${workspace.id}/access-matrix`,
        )
      ).status(),
    ).toBe(403);
    expect((await memberPage.request.get("/admin/access")).status()).toBe(404);
    await memberPage.goto("/me/mcp");
    await expect(
      memberPage
        .locator(".mcp-form")
        .getByText("summaries:read", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("system access matrix shares the token policy confirmation and shows organization grant states", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, true);
  let tokenId: string | undefined;
  try {
    const response = await page.request.post("/api/workspaces", {
      data: { name: `Matrix org ${crypto.randomUUID()}` },
    });
    expect(response.status()).toBe(201);
    const organization = workspaceSchema.parse(await response.json());
    const home = me.workspaces[0];
    const agent = memberListSchema
      .parse(
        await (
          await page.request.get(`/api/members?workspaceId=${home.id}`)
        ).json(),
      )
      .find((member) => member.kind === "agent")!;
    const issued = await page.request.post("/api/agent-tokens", {
      data: {
        workspaceId: home.id,
        memberId: agent.id,
        name: `Matrix token ${crypto.randomUUID()}`,
        scopes: ["tasks:read"],
      },
    });
    expect(issued.status()).toBe(201);
    const token = issuedAgentTokenSchema.parse(await issued.json());
    tokenId = token.id;
    await page.goto("/admin/access");
    const row = page.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: token.name, exact: true }),
    });
    const policy = row.getByTestId("token-policy-switch");
    await expect(policy).not.toBeChecked();
    await policy.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(organization.name);
    await dialog.getByTestId("grant-confirm").click();
    await expect(policy).toBeChecked();
    await expect(row).toContainText(m.mcp.grantActive);
    await page.goto("/me/mcp");
    const card = page.getByTestId("token-card").filter({ hasText: token.name });
    await card.locator("summary").click();
    const editor = card.getByRole("region", {
      name: m.mcp.workspaceGrants,
      exact: true,
    });
    await editor
      .getByRole("checkbox", { name: "summaries:read", exact: true })
      .check();
    await editor
      .getByRole("button", { name: m.mcp.saveGrant, exact: true })
      .click();
    await expect(
      editor.locator(`[data-workspace-id="${home.id}"]`),
    ).toContainText("summaries:read");
    await card.getByTestId("token-policy-switch").click();
    await dialog.getByTestId("grant-confirm").click();
    await expect(card.getByTestId("token-policy-switch")).not.toBeChecked();
    await page.goto("/admin/access");
    await expect(policy).not.toBeChecked();
    await expect(row).toContainText(m.mcp.revoked);
  } finally {
    if (tokenId)
      expect(
        (await page.request.delete(`/api/agent-tokens/${tokenId}`)).ok(),
      ).toBe(true);
    await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, false);
  }
});

test("workspace admin reads the baseline permission rows the matrix returns", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const matrix = accessMatrixSchema.parse(
    await (
      await page.request.get(`/api/workspaces/${workspace.id}/access-matrix`)
    ).json(),
  );
  await page.goto("/orgs/access");
  await page
    .getByRole("tab", { name: m.access.permissions, exact: true })
    .click();
  await expect(page.getByTestId("access-permissions-baseline")).toHaveText(
    m.access.permissionsBaseline,
  );
  await expect(page.getByTestId("access-permission-row")).toHaveCount(
    matrix.actions.length,
  );
  const manage = page.locator(
    '[data-testid="access-permission-row"][data-action="workspace:manage"]',
  );
  await expect(manage.locator('[data-role="admin"]')).toHaveAttribute(
    "data-allowed",
    "true",
  );
  await expect(manage.locator('[data-role="member"]')).toHaveAttribute(
    "data-allowed",
    "false",
  );
  await expect(manage.locator('[data-role="member"]')).toContainText(
    m.access.denied,
  );
  await expect(
    page.locator(".access-group th", { hasText: m.access.group.finance }),
  ).toBeVisible();
});
