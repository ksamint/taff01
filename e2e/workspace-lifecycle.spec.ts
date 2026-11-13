import { expect, test } from "@playwright/test";
import { setLocalTestSystemAdmin } from "../packages/core/src/testing/system-admin";
import {
  issuedWorkspaceInviteSchema,
  meSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";

test("organization admin confirms the exact name, archives and restores without selecting it or restoring defaults", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const personal = me.workspaces[0];
  await page.goto("/orgs");
  await expect(page.getByTestId("archive-organization")).toHaveCount(0);
  await expect(page.getByTestId("archived-organizations")).toHaveCount(0);
  const team = workspaceSchema.parse(
    await (
      await page.request.post("/api/workspaces", {
        data: { name: `Archive ${locale}` },
      })
    ).json(),
  );
  await page.reload();
  await page.getByTestId(`workspace-${team.id}`).click();
  await page.locator("#default-workspace").selectOption(team.id);
  await expect(page.locator("#default-workspace")).toHaveValue(team.id);
  await page.getByTestId("archive-organization").click();
  const submit = page.getByTestId("confirm-archive-organization");
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText(
    messages[locale].organization.archiveConsequences.replace(
      "{{name}}",
      team.name,
    ),
  );
  await page
    .getByTestId("archive-organization-name")
    .fill(`${team.name} wrong`);
  await expect(submit).toBeDisabled();
  await page.getByTestId("archive-organization-name").fill(team.name);
  await page.screenshot({
    path: info.outputPath("archive-confirmation.png"),
    fullPage: true,
  });
  const archived = page.waitForResponse(
    (res) =>
      res.url().endsWith(`/api/workspaces/${team.id}`) &&
      res.request().method() === "DELETE",
  );
  await submit.click();
  expect((await archived).status()).toBe(200);
  await expect(page.getByTestId(`workspace-${team.id}`)).toHaveCount(0);
  await expect(page.locator("#default-workspace")).toHaveValue("");
  await expect(page.getByTestId(`workspace-${personal.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId(`restore-${team.id}`)).toBeVisible();
  const restoreUrl = `**/api/workspaces/${team.id}/restore`;
  await page.route(restoreUrl, (route) =>
    route.fulfill({ status: 503, json: { error: "internal_error" } }),
  );
  await page.getByTestId(`restore-${team.id}`).click();
  await expect(
    page.getByTestId("workspace-lifecycle").getByRole("alert"),
  ).toHaveText(messages[locale].errors.internal_error);
  await expect(page.getByTestId(`restore-${team.id}`)).toBeVisible();
  await expect(page.getByTestId(`workspace-${team.id}`)).toHaveCount(0);
  await page.unroute(restoreUrl);
  const restored = page.waitForResponse((res) =>
    res.url().endsWith(`/api/workspaces/${team.id}/restore`),
  );
  await page.getByTestId(`restore-${team.id}`).click();
  expect((await restored).status()).toBe(200);
  await expect(page.getByTestId(`workspace-${team.id}`)).toBeVisible();
  await expect(page.getByTestId(`workspace-${personal.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#default-workspace")).toHaveValue("");
  await expect(page.getByTestId(`restore-${team.id}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`workspace-${personal.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#default-workspace")).toHaveValue("");
  await page.screenshot({
    path: info.outputPath("organization-restored.png"),
    fullPage: true,
  });
});

test("members and guests have no lifecycle controls and demotion removes an open archive dialog", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  await freshAccount(page, locale);
  const team = workspaceSchema.parse(
    await (
      await page.request.post("/api/workspaces", {
        data: { name: `Lifecycle roles ${locale}` },
      })
    ).json(),
  );
  const context = await browser.newContext({ baseURL: process.env.AUTH_URL });
  try {
    const reader = await context.newPage();
    const me = await freshAccount(reader, locale);
    await verifyTestEmail(reader, me.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${team.id}/invites`, {
          data: { email: me.user.email, role: "guest" },
        })
      ).json(),
    );
    const membership = workspaceSchema.parse(
      await (
        await reader.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).json(),
    );
    for (const role of ["guest", "member"] as const) {
      expect(
        (
          await page.request.patch(
            `/api/workspaces/${team.id}/members/${membership.memberId}`,
            { data: { role } },
          )
        ).status(),
      ).toBe(200);
      await reader.goto("/orgs");
      await reader.getByTestId(`workspace-${team.id}`).click();
      await expect(reader.getByTestId("archive-organization")).toHaveCount(0);
      await expect(reader.getByTestId("archived-organizations")).toHaveCount(0);
      await expect(
        reader.getByTestId("workspace-lifecycle").getByRole("alert"),
      ).toHaveCount(0);
      expect(
        (await reader.request.get("/api/workspaces/archived")).status(),
      ).toBe(403);
      expect(
        (await reader.request.delete(`/api/workspaces/${team.id}`)).status(),
      ).toBe(403);
      expect(
        (
          await reader.request.post(`/api/workspaces/${team.id}/restore`)
        ).status(),
      ).toBe(403);
      expect((await reader.request.get("/admin")).status()).toBe(404);
    }
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${team.id}/members/${membership.memberId}`,
          { data: { role: "admin" } },
        )
      ).status(),
    ).toBe(200);
    await reader.reload();
    await reader.getByTestId("archive-organization").click();
    await expect(
      reader.getByTestId("confirm-archive-organization"),
    ).toBeVisible();
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${team.id}/members/${membership.memberId}`,
          { data: { role: "member" } },
        )
      ).status(),
    ).toBe(200);
    await expect(
      reader.getByTestId("confirm-archive-organization"),
    ).toHaveCount(0);
    expect(
      (await page.request.delete(`/api/workspaces/${team.id}`)).status(),
    ).toBe(200);
    expect(
      (
        await reader.request.post(`/api/workspaces/${team.id}/restore`)
      ).status(),
    ).toBe(403);
    expect(
      (await reader.request.get("/api/workspaces/archived")).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
});

test("system administration restores organizations but never offers personal lifecycle controls", async ({
  page,
}, info) => {
  const me = await freshAccount(page, info.project.name as TestLocale);
  const personal = me.workspaces[0];
  const team = workspaceSchema.parse(
    await (
      await page.request.post("/api/workspaces", {
        data: { name: `System lifecycle ${info.project.name}` },
      })
    ).json(),
  );
  expect((await page.request.get("/admin")).status()).toBe(404);
  await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, true);
  try {
    await page.goto("/orgs");
    await page.getByTestId("open-workspace-administration").click();
    await expect(page.getByTestId(`lifecycle-${personal.id}`)).toBeVisible();
    await expect(page.getByTestId(`archive-${personal.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`restore-${personal.id}`)).toHaveCount(0);
    await page.getByTestId(`archive-${team.id}`).click();
    await page.getByTestId("archive-organization-name").fill(team.name);
    const archiveResponse = page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/workspaces/${team.id}`) &&
        res.request().method() === "DELETE",
    );
    await page.getByTestId("confirm-archive-organization").click();
    expect((await archiveResponse).status()).toBe(200);
    await expect(page.getByTestId(`restore-${team.id}`)).toBeVisible();
    const restoreResponse = page.waitForResponse((res) =>
      res.url().endsWith(`/api/workspaces/${team.id}/restore`),
    );
    await page.getByTestId(`restore-${team.id}`).click();
    expect((await restoreResponse).status()).toBe(200);
    await expect(page.getByTestId(`archive-${team.id}`)).toBeVisible();
    expect(
      meSchema.parse(await (await page.request.get("/api/me")).json()).user
        .defaultWorkspaceId,
    ).toBeNull();
  } finally {
    await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, false);
  }
});
