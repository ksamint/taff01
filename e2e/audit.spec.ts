import { expect, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  meSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { selectLocale } from "./support/preferences";

// Milestone 36 audit endpoints, now with a screen: workspace admins only.
test.use({ actionTimeout: 15000 });

test("an admin reads and filters the audit log; a member is refused", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const admin = await freshAccount(page, locale);
  const workspace = admin.workspaces[0];
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Audited ${locale}` } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());

  await page.goto("/orgs");
  await page.getByTestId("open-audit-log").click();
  const view = page.getByTestId("audit-view");
  await expect(view.getByRole("heading", { level: 1 })).toHaveText(
    m.audit.title,
  );
  const row = view.locator(
    `[data-testid="audit-row"][data-action="projects.insert"][data-resource="${project.id}"]`,
  );
  await expect(row).toBeVisible();
  // The actor resolves to the admin's member name.
  await expect(row).toContainText(admin.user.name);

  await view.getByTestId("audit-kind").selectOption("trace_id");
  await view.getByTestId("audit-value").fill("not-a-trace");
  await view.getByTestId("audit-apply").click();
  await expect(view.getByTestId("audit-invalid")).toHaveText(m.audit.invalid);

  await view.getByTestId("audit-value").fill("f".repeat(32));
  await view.getByTestId("audit-apply").click();
  await expect(view.getByTestId("audit-empty")).toHaveText(m.audit.none);
  await expect(view.getByTestId("audit-filtered")).toContainText(
    "f".repeat(32),
  );
  await view.getByTestId("audit-clear").click();
  await expect(row).toBeVisible();

  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    serviceWorkers: "block",
    locale: locale === "en" ? "en-US" : locale,
    viewport: page.viewportSize(),
  });
  try {
    const member = await context.newPage();
    const email = `audit-${crypto.randomUUID()}@example.test`;
    expect(
      (
        await member.request.post("/api/auth/sign-up/email", {
          headers: { Origin: process.env.AUTH_URL! },
          data: {
            name: `Reader ${locale}`,
            email,
            password: process.env.DEMO_PASSWORD,
          },
        })
      ).status(),
    ).toBe(200);
    const me = meSchema.parse(
      await (await member.request.get("/api/me")).json(),
    );
    await verifyTestEmail(member, me.user.id);
    const issued = await page.request.post(
      `/api/workspaces/${workspace.id}/invites`,
      { data: { email, role: "member" } },
    );
    expect(issued.status()).toBe(201);
    const invite = issuedWorkspaceInviteSchema.parse(await issued.json());
    expect(
      (
        await member.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.request.get(
          `/api/admin/audit/search?workspaceId=${workspace.id}`,
        )
      ).status(),
    ).toBe(403);
    await member.goto("/");
    await expect(member.getByTestId("today-heading")).toBeVisible();
    await selectLocale(member, locale);
    await member.goto("/orgs");
    await member.getByTestId(`workspace-${workspace.id}`).click();
    await expect(
      member.getByTestId(`workspace-${workspace.id}`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(member.getByTestId("open-audit-log")).toHaveCount(0);
    await member.goto("/orgs/audit");
    await expect(member.getByTestId("audit-forbidden")).toBeVisible();
    await expect(member.getByTestId("audit-row")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
