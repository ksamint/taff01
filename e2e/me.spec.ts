import { expect, test } from "@playwright/test";
import { memberListSchema, meSchema } from "../packages/schemas/src/base";
import {
  issuedWorkspaceInviteSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { notificationPreferencesSchema } from "../packages/schemas/src/notification-preferences";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { holdRequest } from "./support/routes";

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
  await page.getByTestId("team-invite").click();
  await expect(page.locator("#invite-email")).toBeVisible();
  await page
    .getByRole("dialog")
    .locator(":scope > .section-heading")
    .getByRole("button")
    .click();
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
  const denied = await holdRequest(page, "/api/profile", {
    method: "PATCH",
    reply: "reject",
  });
  try {
    await page.getByTestId("me-tz").selectOption("America/New_York");
    await denied.seen;
    await expect(page.getByTestId("me-tz")).toHaveValue("America/New_York");
    await expect(page.getByTestId("me-tz")).toBeDisabled();
    denied.release();
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
    denied.release();
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

test("Me links directly to settings permitted for admin, member and guest", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const admin = await freshAccount(page, locale);
  const workspace = admin.workspaces[0];
  const publicSettings = [
    "/orgs",
    "/me/mcp",
    "/me/notifications",
    "/digests",
    "/summaries",
  ];
  const adminSettings = ["/orgs/access", "/orgs/audit", "/orgs/summaries"];
  await page.goto("/me");
  for (const href of [...publicSettings, ...adminSettings]) {
    await expect(page.locator(`.me-rows a[href="${href}"]`)).toBeVisible();
  }
  await expect(page.getByTestId("open-mcp")).toContainText(
    messages[locale].mcp.title,
  );

  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    serviceWorkers: "block",
    viewport: page.viewportSize(),
  });
  try {
    const reader = await context.newPage();
    const email = `me-settings-${crypto.randomUUID()}@example.test`;
    const signup = await reader.request.post("/api/auth/sign-up/email", {
      headers: { Origin: process.env.AUTH_URL! },
      data: { name: "Reader", email, password: process.env.DEMO_PASSWORD },
    });
    expect(signup.status()).toBe(200);
    const identity = meSchema.parse(
      await (await reader.request.get("/api/me")).json(),
    );
    await verifyTestEmail(reader, identity.user.id);
    const response = await page.request.post(
      `/api/workspaces/${workspace.id}/invites`,
      { data: { email, role: "member" } },
    );
    expect(response.status()).toBe(201);
    const invite = issuedWorkspaceInviteSchema.parse(await response.json());
    expect(
      (
        await reader.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    const me = meSchema.parse(
      await (await reader.request.get("/api/me")).json(),
    );
    const joined = me.workspaces.find(({ id }) => id === workspace.id);
    if (!joined) throw new Error("The reader did not join");
    await reader.goto("/orgs");
    const selection = reader.getByTestId(`workspace-${workspace.id}`);
    await selection.click();
    await expect(selection).toHaveAttribute("aria-pressed", "true");
    for (const role of ["member", "guest"] as const) {
      if (role === "guest") {
        expect(
          (
            await page.request.patch(
              `/api/workspaces/${workspace.id}/members/${joined.memberId}`,
              { data: { role } },
            )
          ).status(),
        ).toBe(200);
      }
      await reader.goto("/me");
      for (const href of publicSettings) {
        await expect(
          reader.locator(`.me-rows a[href="${href}"]`),
        ).toBeVisible();
      }
      for (const href of adminSettings) {
        await expect(reader.locator(`.me-rows a[href="${href}"]`)).toHaveCount(
          0,
        );
      }
    }
  } finally {
    await context.close();
  }
});
