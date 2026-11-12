import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import {
  audienceRecipientListSchema,
  audienceRecipientSchema,
  audienceTagSchema,
  contactSchema,
  dailySummarySchema,
  issuedWorkspaceInviteSchema,
  memberListSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";

test.use({ actionTimeout: 15000 });

test("an admin edits audience details, validates input and keeps saved summaries immutable", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const tag = audienceTagSchema.parse(
    await (
      await page.request.post(`/api/workspaces/${workspace.id}/audience-tags`, {
        data: { org: "Original organization", label: "Original label" },
      })
    ).json(),
  );
  const recipient = audienceRecipientSchema.parse(
    await (
      await page.request.post(`/api/audience-tags/${tag.id}/recipients`, {
        data: {
          name: "Original recipient",
          locale,
          timeZone: "UTC",
          deliverAt: "00:00",
        },
      })
    ).json(),
  );
  const contact = contactSchema.parse(
    await (
      await page.request.post(`/api/contacts?workspaceId=${workspace.id}`, {
        data: { name: "Pat contact" },
      })
    ).json(),
  );
  const generated = await promisify(execFile)(process.execPath, [
    "--env-file=.env",
    "node_modules/tsx/dist/cli.mjs",
    "e2e/support/generate-summary.mts",
    recipient.id,
    "--snapshot-only",
  ]);
  const { summaryId } = JSON.parse(generated.stdout) as { summaryId: string };
  const original = dailySummarySchema.parse(
    await (await page.request.get(`/api/summaries/${summaryId}`)).json(),
  );

  await page.goto("/orgs/summaries");
  const tagRow = page.locator(
    `[data-testid="audience-tag-row"][data-tag="${tag.id}"]`,
  );
  await tagRow.getByTestId("audience-tag-edit").click();
  const tagForm = page.getByTestId("audience-tag-form");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    m.audience.editTag,
  );
  await tagForm.getByTestId("audience-tag-org").fill("Updated organization");
  await tagForm.getByTestId("audience-tag-label").fill("");
  await tagForm.getByTestId("audience-tag-label").press("Enter");
  await expect(tagForm).toHaveCount(0);
  await expect(tagRow).toContainText("Updated organization");
  await expect(tagRow).not.toContainText("Original label");

  const row = page.locator(
    `[data-testid="audience-recipient-row"][data-recipient="${recipient.id}"]`,
  );
  await row.getByTestId("audience-recipient-edit").click();
  const form = page.getByTestId("audience-recipient-form");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    m.audience.editRecipient,
  );
  await expect(form.getByTestId("audience-recipient-edit-name")).toHaveValue(
    recipient.name,
  );
  await form
    .getByTestId("audience-recipient-edit-name")
    .fill("Updated recipient");
  await form.getByTestId("audience-recipient-edit-zone").fill("Not/AZone");
  await form.getByTestId("audience-recipient-save").click();
  await expect(form.getByRole("alert")).toHaveText(m.errors.invalid_input);
  await form.getByTestId("audience-recipient-edit-zone").fill("Asia/Hong_Kong");
  const nextLocale = locale === "en" ? "zh-HK" : "en";
  await form
    .getByTestId("audience-recipient-edit-locale")
    .selectOption(nextLocale);
  await form.getByTestId("audience-recipient-edit-time").fill("09:30");
  await form
    .getByTestId("audience-recipient-edit-account")
    .selectOption(me.user.id);
  await form.getByTestId("audience-recipient-contact").selectOption(contact.id);
  await form.getByRole("checkbox", { name: m.audience.includeFinance }).check();
  await form.getByRole("checkbox", { name: m.audience.showPeople }).uncheck();

  // A rejected PATCH leaves the draft visible and rolls the optimistic row back.
  await page.route(
    `**/api/audience-recipients/${recipient.id}`,
    async (route) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({ status: 409, json: { error: "conflict" } });
      else await route.continue();
    },
  );
  await form.getByTestId("audience-recipient-save").click();
  await expect(form.getByRole("alert")).toHaveText(m.errors.conflict);
  await expect(form.getByTestId("audience-recipient-edit-name")).toHaveValue(
    "Updated recipient",
  );
  await expect(row).toContainText("Original recipient");
  await page.unroute(`**/api/audience-recipients/${recipient.id}`);
  await form.getByTestId("audience-recipient-save").click();
  await expect(form).toHaveCount(0);
  await expect(row).toContainText("Updated recipient");
  const readRecipients = async () =>
    audienceRecipientListSchema.parse(
      await (
        await page.request.get(`/api/audience-tags/${tag.id}/recipients`)
      ).json(),
    );
  await expect.poll(readRecipients).toMatchObject([
    {
      name: "Updated recipient",
      contactId: contact.id,
      userId: me.user.id,
      locale: nextLocale,
      timeZone: "Asia/Hong_Kong",
      deliverAt: "09:30",
      includeFinance: true,
      showPeople: false,
    },
  ]);
  expect((await readRecipients())[0].nextDueAt).not.toBe(recipient.nextDueAt);
  expect(
    dailySummarySchema.parse(
      await (await page.request.get(`/api/summaries/${summaryId}`)).json(),
    ),
  ).toEqual(original);

  // Optional links can be removed; Escape cancels another draft and returns focus.
  await row.getByTestId("audience-recipient-edit").click();
  await form.getByTestId("audience-recipient-contact").selectOption("");
  await form.getByTestId("audience-recipient-edit-account").selectOption("");
  await form.getByTestId("audience-recipient-save").click();
  await expect(form).toHaveCount(0);
  await expect
    .poll(readRecipients)
    .toMatchObject([{ contactId: null, userId: null }]);
  await row.getByTestId("audience-recipient-edit").click();
  await form
    .getByTestId("audience-recipient-edit-name")
    .fill("Cancelled draft");
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(row.getByTestId("audience-recipient-edit")).toBeFocused();
  await expect(row).not.toContainText("Cancelled draft");
});

test("a demoted audience administrator cannot retain editing access", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const owner = await freshAccount(page, locale);
  const workspace = owner.workspaces[0];
  const tag = audienceTagSchema.parse(
    await (
      await page.request.post(`/api/workspaces/${workspace.id}/audience-tags`, {
        data: { org: "Demotion test" },
      })
    ).json(),
  );
  const recipient = audienceRecipientSchema.parse(
    await (
      await page.request.post(`/api/audience-tags/${tag.id}/recipients`, {
        data: {
          name: "Recipient",
          locale,
          timeZone: "UTC",
          deliverAt: "18:00",
        },
      })
    ).json(),
  );
  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    serviceWorkers: "block",
    viewport: page.viewportSize(),
    locale: locale === "en" ? "en-US" : locale,
  });
  try {
    const admin = await context.newPage();
    const person = await freshAccount(admin, locale);
    await verifyTestEmail(admin, person.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email: person.user.email, role: "admin" },
        })
      ).json(),
    );
    expect(
      (
        await admin.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    await admin.goto("/orgs");
    await admin.getByTestId(`workspace-${workspace.id}`).click();
    await admin.goto("/orgs/summaries");
    await admin.getByTestId("audience-recipient-edit").click();
    await expect(admin.getByTestId("audience-recipient-form")).toBeVisible();
    const member = memberListSchema
      .parse(
        await (
          await page.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      )
      .find((item) => item.userId === person.user.id)!;
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${workspace.id}/members/${member.id}`,
          { data: { role: "member" } },
        )
      ).status(),
    ).toBe(200);
    for (const [path, data] of [
      [
        `/api/audience-tags/${tag.id}`,
        { version: tag.version, label: "Denied" },
      ],
      [
        `/api/audience-recipients/${recipient.id}`,
        { version: recipient.version, name: "Denied" },
      ],
    ] as const) {
      expect((await admin.request.patch(path, { data })).status()).toBe(403);
    }
    await admin.reload();
    await expect(
      admin
        .getByRole("status")
        .filter({ hasText: messages[locale].audience.adminOnly }),
    ).toBeVisible();
    await expect(admin.getByTestId("audience-recipient-form")).toHaveCount(0);
    await expect(admin.getByTestId("audience-tag-edit")).toHaveCount(0);
    await expect(admin.getByTestId("audience-recipient-edit")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
