import { expect, test } from "@playwright/test";
import { workspaceSchema } from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test("login uses the saved organization default and manual switches survive reload", async ({
  page,
}, info) => {
  const me = await freshAccount(page, info.project.name as TestLocale);
  const personal = me.workspaces[0];
  const response = await page.request.post("/api/workspaces", {
    data: { name: `Default team ${crypto.randomUUID()}` },
  });
  expect(response.status()).toBe(201);
  const team = workspaceSchema.parse(await response.json());
  await page.goto("/orgs");
  const select = page.locator("#default-workspace");
  await expect(select).toHaveValue("");
  const save = page.waitForResponse(
    (res) =>
      res.url().endsWith(`/api/users/${me.user.id}/default-workspace`) &&
      res.request().method() === "PATCH",
  );
  await select.selectOption(team.id);
  expect((await save).status()).toBe(200);
  await expect(select).toHaveValue(team.id);
  await page.getByTestId(`workspace-${personal.id}`).click();
  await page.reload();
  await expect(page.getByTestId(`workspace-${personal.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/me");
  await page
    .getByRole("button", {
      name: messages[info.project.name as TestLocale].signOut,
      exact: true,
    })
    .click();
  await page.getByTestId("auth-email").fill(me.user.email);
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD!);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await page.goto("/orgs");
  await expect(page.getByTestId(`workspace-${team.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    (await page.request.delete(`/api/workspaces/${team.id}`)).status(),
  ).toBe(200);
});
