import { expect, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  memberListSchema,
  meSchema,
  paymentListSchema,
  projectListSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { selectLocale } from "./support/preferences";

// ADR 0021: every person reads finance; only admins change the contract,
// currency, client company and append-only payments (finance:manage).
test.use({ actionTimeout: 15000 });

test("an admin sets the contract and records a payment; a member reads it and a guest sees none", async ({
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
    { data: { name: `Finance ${locale}` } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());

  await page.goto(`/projects/${project.id}?view=timeline`);
  const panel = page.getByTestId("project-finance");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("project-finance-contract")).toHaveText(
    m.projectFinance.noContract,
  );
  // A payment needs a currency, as the back end's collection rule does.
  await expect(panel.getByTestId("project-finance-record")).toBeDisabled();

  await panel.getByTestId("project-finance-edit").click();
  const form = page.getByTestId("project-finance-form");
  await form.getByTestId("project-finance-contract-input").fill("12.345");
  await form.getByTestId("project-finance-save").click();
  await expect(form.getByTestId("project-finance-error")).toHaveText(
    m.projectFinance.invalidAmount,
  );
  await form.getByTestId("project-finance-contract-input").fill("100000");
  await form.getByTestId("project-finance-currency").selectOption("HKD");
  await form.getByTestId("project-finance-save").click();
  await expect(form).toHaveCount(0);
  await expect
    .poll(async () =>
      projectListSchema
        .parse(
          await (
            await page.request.get(`/api/projects?workspaceId=${workspace.id}`)
          ).json(),
        )
        .find((item) => item.id === project.id),
    )
    .toMatchObject({ contractAmount: "100000.00", currency: "HKD" });

  await panel.getByTestId("project-finance-record").click();
  const payment = page.getByTestId("project-payment-form");
  await payment.getByTestId("project-payment-amount").fill("0");
  await payment.getByTestId("project-payment-save").click();
  await expect(payment.getByTestId("project-payment-error")).toHaveText(
    m.projectFinance.positiveAmount,
  );
  await payment.getByTestId("project-payment-amount").fill("25000");
  await payment.getByTestId("project-payment-note").fill("Deposit");
  await payment.getByTestId("project-payment-save").click();
  await expect(payment).toHaveCount(0);
  await expect(panel.getByTestId("project-payment")).toHaveCount(1);
  await expect(panel.getByTestId("project-payment")).toContainText("Deposit");
  await expect(panel.getByTestId("project-finance-collected")).toContainText(
    "25%",
  );
  const stored = paymentListSchema.parse(
    await (
      await page.request.get(`/api/projects/${project.id}/payments`)
    ).json(),
  );
  expect(stored.map((item) => item.amount)).toEqual(["25000.00"]);
  // After money is received the currency is locked, as the back end requires.
  await panel.getByTestId("project-finance-edit").click();
  await expect(
    page
      .getByTestId("project-finance-form")
      .getByTestId("project-finance-currency"),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  // A verified second person joins as a member, then becomes a guest.
  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    serviceWorkers: "block",
    locale: locale === "en" ? "en-US" : locale,
    viewport: page.viewportSize(),
  });
  try {
    const member = await context.newPage();
    const email = `finance-${crypto.randomUUID()}@example.test`;
    const signedUp = await member.request.post("/api/auth/sign-up/email", {
      headers: { Origin: process.env.AUTH_URL! },
      data: {
        name: `Reader ${locale}`,
        email,
        password: process.env.DEMO_PASSWORD,
      },
    });
    expect(signedUp.status()).toBe(200);
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
    await member.goto("/");
    await expect(member.getByTestId("today-heading")).toBeVisible();
    await selectLocale(member, locale);
    await member.goto("/orgs");
    await member.getByTestId(`workspace-${workspace.id}`).click();
    await expect(
      member.getByTestId(`workspace-${workspace.id}`),
    ).toHaveAttribute("aria-pressed", "true");
    await member.goto(`/projects/${project.id}?view=timeline`);
    const readOnly = member.getByTestId("project-finance");
    await expect(readOnly).toBeVisible();
    await expect(readOnly).toContainText(m.projectFinance.readOnly);
    await expect(readOnly.getByTestId("project-payment")).toHaveCount(1);
    await expect(readOnly.getByTestId("project-finance-edit")).toHaveCount(0);
    await expect(readOnly.getByTestId("project-finance-record")).toHaveCount(0);

    const memberId = memberListSchema
      .parse(
        await (
          await page.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      )
      .find((item) => item.userId === me.user.id)?.id;
    if (!memberId) throw new Error("The member did not join");
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${workspace.id}/members/${memberId}`,
          { data: { role: "guest" } },
        )
      ).status(),
    ).toBe(200);
    await member.reload();
    await expect(member.getByTestId("timeline-view")).toBeVisible();
    await expect(member.getByTestId("project-finance")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
