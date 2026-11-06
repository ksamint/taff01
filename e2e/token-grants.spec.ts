import { expect, test } from "@playwright/test";
import { setLocalTestSystemAdmin } from "../packages/core/src/testing/system-admin";
import {
  agentTokenWorkspaceListSchema,
  issuedAgentTokenSchema,
  memberListSchema,
  meSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test("system admin confirms organization policy, sees grant origins, revokes and restores", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, true);
  try {
    expect(
      meSchema.parse(await (await page.request.get("/api/me")).json()).user
        .systemAdmin,
    ).toBe(true);
    const organizations = [];
    for (const name of ["Home", "Manual", "Policy"]) {
      const response = await page.request.post("/api/workspaces", {
        data: { name: `Grant ${name} ${locale} ${crypto.randomUUID()}` },
      });
      expect(response.status()).toBe(201);
      organizations.push(workspaceSchema.parse(await response.json()));
    }
    const [home, manual, policy] = organizations;
    const agents = [];
    for (const organization of [home, manual]) {
      const response = await page.request.get(
        `/api/members?workspaceId=${organization.id}`,
      );
      expect(response.ok()).toBe(true);
      agents.push(
        memberListSchema
          .parse(await response.json())
          .find((member) => member.kind === "agent")!,
      );
    }
    const issued = await page.request.post("/api/agent-tokens", {
      data: {
        workspaceId: home.id,
        memberId: agents[0].id,
        name: `Grant token ${crypto.randomUUID()}`,
        scopes: ["tasks:read"],
      },
    });
    expect(issued.status()).toBe(201);
    const token = issuedAgentTokenSchema.parse(await issued.json());
    try {
      expect(
        (
          await page.request.put(`/api/agent-tokens/${token.id}/workspaces`, {
            data: {
              workspaceId: manual.id,
              memberId: agents[1].id,
              scopes: ["tasks:read"],
            },
          })
        ).ok(),
      ).toBe(true);
      await page.goto("/");
      await page.evaluate(
        ({ userId, workspaceId }) =>
          sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId),
        { userId: me.user.id, workspaceId: home.id },
      );
      await page.goto("/me/mcp");
      const card = page
        .getByTestId("token-card")
        .filter({ hasText: token.name });
      await card.locator("summary").click();
      const manualRow = card.locator(`[data-workspace-id="${manual.id}"]`);
      await expect(manualRow).toContainText(m.mcp.policy.manual);
      const policySwitch = card.getByTestId("token-policy-switch");
      await policySwitch.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(policy.name);
      await expect(dialog).toContainText(manual.name);
      await expect(policySwitch).not.toBeChecked();
      await dialog
        .getByRole("button", { name: m.mcp.cancel, exact: true })
        .click();
      await expect(policySwitch).not.toBeChecked();
      await policySwitch.click();
      await dialog.getByTestId("grant-confirm").click();
      await expect(dialog).toHaveCount(0);
      await expect(policySwitch).toBeChecked();
      const grants = agentTokenWorkspaceListSchema.parse(
        await (
          await page.request.get(
            `/api/agent-tokens/${token.id}/workspaces?workspaceId=${home.id}`,
          )
        ).json(),
      );
      await expect(card.getByTestId("token-workspace-grant")).toHaveCount(
        grants.length,
      );
      await expect(manualRow).toContainText(m.mcp.policy.manual);
      const row = card.locator(`[data-workspace-id="${policy.id}"]`);
      await expect(row).toContainText(m.mcp.policy.policy);
      await row.getByRole("button").click();
      await card.getByTestId("grant-revoke").click();
      await expect(row).toContainText(m.mcp.revoked);
      const current = meSchema.parse(
        await (await page.request.get("/api/me")).json(),
      );
      await expect(row).toContainText(
        current.workspaces.find((workspace) => workspace.id === policy.id)!
          .memberId,
      );
      await row.getByTestId("grant-restore").click();
      await expect(dialog).toContainText(policy.id);
      await dialog
        .getByRole("button", { name: m.mcp.cancel, exact: true })
        .click();
      await expect(row).toContainText(m.mcp.revoked);
      await row.getByTestId("grant-restore").click();
      await dialog.getByTestId("grant-confirm").click();
      await expect(row).toContainText(m.mcp.grantActive);
      await expect(row.getByTestId("grant-restore")).toHaveCount(0);
      await policySwitch.click();
      await dialog.getByTestId("grant-confirm").click();
      await expect(policySwitch).not.toBeChecked();
      await expect(manualRow).toContainText(m.mcp.grantActive);
      await expect(row).toContainText(m.mcp.revoked);
    } finally {
      expect(
        (await page.request.delete(`/api/agent-tokens/${token.id}`)).ok(),
      ).toBe(true);
    }
  } finally {
    await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, false);
  }
});

test("workspace administrators see manual grant origins without a system policy control", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const home = me.workspaces[0];
  const agents = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${home.id}`)
    ).json(),
  );
  const issued = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId: home.id,
      memberId: agents.find((member) => member.kind === "agent")!.id,
      name: `Admin grant ${crypto.randomUUID()}`,
      scopes: ["tasks:read"],
    },
  });
  expect(issued.status()).toBe(201);
  const token = issuedAgentTokenSchema.parse(await issued.json());
  const created = await page.request.post("/api/workspaces", {
    data: { name: `Manual target ${crypto.randomUUID()}` },
  });
  expect(created.status()).toBe(201);
  const target = workspaceSchema.parse(await created.json());
  const members = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${target.id}`)
    ).json(),
  );
  expect(
    (
      await page.request.put(`/api/agent-tokens/${token.id}/workspaces`, {
        data: {
          workspaceId: target.id,
          memberId: members.find((member) => member.kind === "agent")!.id,
          scopes: ["tasks:read"],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/me/mcp");
  const card = page.getByTestId("token-card").filter({ hasText: token.name });
  await card.locator("summary").click();
  await expect(
    card.locator(`[data-workspace-id="${target.id}"]`),
  ).toContainText(messages[locale].mcp.policy.manual);
  await expect(card.getByTestId("token-policy-switch")).toHaveCount(0);
});
