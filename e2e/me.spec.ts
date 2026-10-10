import { expect, test } from "@playwright/test";
import { memberListSchema, meSchema } from "../packages/schemas/src/base";
import { workspaceSchema } from "../packages/schemas/src/index";
import { notificationPreferencesSchema } from "../packages/schemas/src/notification-preferences";
import { freshAccount, messages, type TestLocale } from "./support/account";

test("Me switches real organizations and preserves theme, time-zone rollback and notification preferences", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const before = notificationPreferencesSchema.parse(
    await (await page.request.get("/api/me/notifications")).json(),
  );
  expect(
    (
      await page.request.patch("/api/me/notifications", {
        data: {
          ...before,
          review: false,
          block: true,
          mention: true,
          done: false,
          digest: true,
          digestAt: "18:00",
          quiet: false,
        },
      })
    ).status(),
  ).toBe(200);
  const created = await page.request.post("/api/workspaces", {
    data: { name: `Me organization ${locale} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = workspaceSchema.parse(await created.json());
  const members = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${workspace.id}`)
    ).json(),
  );
  await page.goto("/me");
  await expect(
    page.getByRole("heading", { name: m.me.title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".me-profile-copy strong")).toHaveText(
    me.user.name,
  );
  const languages = page.getByTestId("locale-select").getByRole("button");
  await expect(languages).toHaveCount(3);
  await expect(
    page.getByTestId("locale-select").getByRole("button", {
      name:
        locale === "en"
          ? m.en
          : locale === "zh-HK"
            ? m.me.languageHK
            : m.me.languageCN,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("me-organization").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: m.organization.create, exact: true }),
  ).toHaveAttribute("href", "/orgs#create");
  await page.getByTestId(`me-workspace-${workspace.id}`).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("me-organization")).toContainText(
    workspace.name,
  );
  await expect(page.getByTestId("me-team")).toContainText(
    m.me.teamSummary
      .replace(
        "{{people}}",
        String(members.filter((member) => member.kind === "person").length),
      )
      .replace(
        "{{agents}}",
        String(members.filter((member) => member.kind === "agent").length),
      ),
  );
  await page.getByTestId("me-team").click();
  await expect(page).toHaveURL(/\/orgs#team$/);
  await expect(
    page.getByRole("heading", { name: m.organization.team, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".organizations-view > .page-heading"),
  ).toBeHidden();
  await expect(page.locator(".tabbar")).toBeHidden();
  await page.goto("/me");
  await page.getByTestId("me-organization").click();
  await page.getByTestId("organization-create-entry").click();
  await expect(page).toHaveURL(/\/orgs#create$/);
  await expect(page.locator("#org-name")).toBeVisible();
  await page
    .getByRole("dialog")
    .locator(":scope > .section-heading")
    .getByRole("button")
    .click();
  await page.goto("/me");
  await expect(page.getByTestId("open-notifications")).toContainText(
    `${m.me.notificationSummary.replace("{{count}}", "2")} · ${m.me.digestSummary.replace("{{time}}", "18:00")}`,
  );
  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByTestId("theme-dark")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("me-advanced").click();
  const advanced = page.getByRole("dialog");
  await expect(advanced).toContainText(me.user.email);
  await page.getByTestId("advanced-theme-system").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(
    await page.evaluate(() => localStorage.getItem("taff-theme")),
  ).toBeNull();
  const nextZone = me.user.tz === "Asia/Tokyo" ? "Europe/London" : "Asia/Tokyo";
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/profile" &&
      response.request().method() === "PATCH" &&
      response.request().postDataJSON()?.tz === nextZone,
  );
  await page.getByTestId("me-tz").selectOption(nextZone);
  expect((await saved).status()).toBe(200);
  await expect(page.getByTestId("me-tz")).toBeEnabled();
  await expect(page.getByTestId("me-tz")).toHaveValue(nextZone);
  expect(
    meSchema.parse(await (await page.request.get("/api/me")).json()).user.tz,
  ).toBe(nextZone);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    entered();
    await gate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  try {
    await page.getByTestId("me-tz").selectOption("America/New_York");
    await seen;
    await expect(page.getByTestId("me-tz")).toHaveValue("America/New_York");
    await expect(page.getByTestId("me-tz")).toBeDisabled();
    release();
    await expect(advanced.getByRole("alert")).toHaveText(m.errors.profile);
    await expect(page.getByTestId("me-tz")).toHaveValue(nextZone);
    await expect(page.getByTestId("me-tz")).toBeEnabled();
    expect(
      meSchema.parse(await (await page.request.get("/api/me")).json()).user.tz,
    ).toBe(nextZone);
    await advanced
      .getByRole("button", { name: m.planning.close, exact: true })
      .click();
  } finally {
    release();
    await page.unroute("**/api/profile");
  }
  await page.reload();
  await page.getByTestId("me-advanced").click();
  await expect(page.getByTestId("advanced-theme-system")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("me-tz")).toHaveValue(nextZone);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.planning.close, exact: true })
    .click();
  await page.getByTestId("open-notifications").click();
  await expect(page).toHaveURL(/\/me\/notifications$/);
  await expect(page.getByTestId("notification-review")).not.toBeChecked();
  await expect(page.getByTestId("notification-block")).toBeChecked();
  await expect(page.getByTestId("notification-time-18:00")).toBeChecked();
});
