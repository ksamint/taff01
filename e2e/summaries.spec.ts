import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";
import { htmlLang } from "../apps/web/src/lib/i18n";
import {
  audienceRecipientListSchema,
  audienceTagListSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";
import { openProjectFilters } from "./support/task-fields";

// ADR 0027, S3: an admin tags a project for a shareholder organization, adds
// a link-only recipient, previews, generates through the real job, shares a
// watermarked link that renders outside the app in the recipient's language,
// and revokes it. Runs in en, zh-CN and zh-HK.
test.use({ actionTimeout: 15000 });

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key]));

async function checkRenders(page: Page, hash: string) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("summary-copy-text").click();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await navigator.clipboard.readText()).replace(/\s/g, ""),
      ),
    )
    .toContain(hash);
  const pending = page.waitForEvent("download");
  await page.getByTestId("summary-save-image").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^taff-summary-.*\.png$/);
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

test("an admin tags, previews, shares and revokes a shareholder summary", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const org = `Harbour ${locale} ${Date.now()}`;
  const chip = fill(m.audience.chip, {
    kind: m.audience.kind.shareholder,
    org,
  });

  // A project with one task, created through the API.
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Checkout ${locale}` } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());
  expect(
    (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Launch review ${locale}`,
          projectId: project.id,
        },
      })
    ).status(),
  ).toBe(201);

  // Organizations links admins to the summaries page; create a tag there.
  await page.goto("/orgs");
  await page.getByTestId("open-summaries-admin").click();
  await expect(page.getByTestId("summaries-admin")).toBeVisible();
  await page.getByTestId("audience-tag-org").fill(org);
  await page.getByTestId("audience-tag-create").click();
  const tagRow = page.getByTestId("audience-tag-row").filter({ hasText: org });
  await expect(tagRow).toBeVisible();
  const tag = audienceTagListSchema
    .parse(
      await (
        await page.request.get(`/api/workspaces/${workspace.id}/audience-tags`)
      ).json(),
    )
    .find((item) => item.org === org)!;

  // Tag the project from its edit dialog; the header shows the chip.
  await page.goto(`/projects/${project.id}`);
  await openProjectFilters(page);
  await page.getByTestId("manage-project").click();
  const option = page.locator(
    `[data-testid="project-audience-option"][data-tag="${tag.id}"]`,
  );
  await option.check();
  await expect(page.getByText(m.audience.tagsSaved)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("project-audience-tag")).toHaveText(chip);

  // A link-only recipient in this locale, delivered at midnight UTC.
  await page.goto("/orgs/summaries");
  await tagRow.getByTestId("audience-tag-open").click();
  await page.getByTestId("audience-recipient-name").fill("Pat Lee");
  await page.getByTestId("audience-recipient-locale").selectOption(locale);
  await page.getByTestId("audience-recipient-zone").fill("UTC");
  await page.getByTestId("audience-recipient-time").fill("00:00");
  await page.getByTestId("audience-recipient-create").click();
  const recipientRow = page
    .getByTestId("audience-recipient-row")
    .filter({ hasText: "Pat Lee" });
  await expect(recipientRow).toBeVisible();
  await expect(recipientRow).toContainText(m.audience.linkOnly);

  // Preview: the same document, marked as a preview, nothing saved.
  await recipientRow.getByTestId("summary-preview-open").click();
  const preview = page.getByTestId("summary-preview");
  await expect(preview.getByTestId("summary-preview-note")).toHaveText(
    m.summary.preview,
  );
  await expect(preview.getByTestId("summary-project")).toContainText(
    `Checkout ${locale}`,
  );
  await expect(preview.getByTestId("summary-watermark")).toHaveAttribute(
    "data-text",
    `Pat Lee · ${org} · ${new Date().toISOString().slice(0, 10)} · preview`,
  );
  await page.keyboard.press("Escape");

  // Generate through the real daily job.
  const recipient = audienceRecipientListSchema
    .parse(
      await (
        await page.request.get(`/api/audience-tags/${tag.id}/recipients`)
      ).json(),
    )
    .find((item) => item.name === "Pat Lee")!;
  const generated = await promisify(execFile)(process.execPath, [
    "--env-file=.env",
    "node_modules/tsx/dist/cli.mjs",
    "e2e/support/generate-summary.mts",
    recipient.id,
  ]);
  const { summaryId } = JSON.parse(generated.stdout) as { summaryId: string };

  // Me › Shareholder summaries lists it; the admin page links it too.
  await page.goto("/me");
  await page.getByTestId("open-summaries").click();
  await expect(page.getByTestId("summary-list")).toBeVisible();
  await expect(
    page.locator(`[data-testid="summary-row"][data-summary="${summaryId}"]`),
  ).toBeVisible();

  // The summary page with its watermark and hash; an admin shares it.
  await page.goto("/orgs/summaries");
  await tagRow.getByTestId("audience-tag-open").click();
  await page
    .locator(`[data-testid="summary-row"][data-summary="${summaryId}"]`)
    .click();
  const view = page.getByTestId("summary-view");
  await expect(view).toBeVisible();
  const hash = await view.getAttribute("data-hash");
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  await expect(view.getByTestId("summary-hash")).toContainText(hash!);
  await expect(view.getByTestId("summary-watermark")).toHaveAttribute(
    "data-text",
    new RegExp(
      `^Pat Lee · ${org} · \\d{4}-\\d{2}-\\d{2} · ${summaryId.slice(0, 8)}$`,
    ),
  );
  await checkRenders(page, hash!);
  await page.getByTestId("summary-share-new").click();
  const link = await page.getByTestId("summary-share-link").inputValue();
  expect(link).toMatch(/\/s\/tsum_[A-Za-z0-9_-]{43}$/);

  // A stranger with the link: no session, no app shell, recipient language.
  const stranger = await browser.newContext({ locale: "en-US" });
  try {
    const outside = await stranger.newPage();
    await outside.goto(link);
    const shared = outside.getByTestId("share-page");
    await expect(shared).toHaveAttribute("lang", htmlLang(locale));
    await expect(shared.getByRole("heading", { level: 1 })).toHaveText(
      m.summary.heading,
    );
    await expect(shared.getByTestId("summary-hash")).toContainText(hash!);
    await expect(shared.getByTestId("summary-watermark")).toHaveAttribute(
      "data-text",
      new RegExp(`^Pat Lee · ${org} · `),
    );
    await expect(shared.getByTestId("summary-project")).toContainText(
      `Checkout ${locale}`,
    );
    await expect(outside.getByTestId("share-print")).toHaveText(
      m.summary.print,
    );
    await expect(outside.getByTestId("today-heading")).toHaveCount(0);
    await expect(outside.getByTestId("auth-email")).toHaveCount(0);
    expect(
      await outside.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");

    await checkRenders(outside, hash!);

    // Revoke with the confirm step; the same link now shows unavailable.
    const row = page
      .getByTestId("summary-share-row")
      .filter({ has: page.getByTestId("summary-share-revoke") });
    await row.getByTestId("summary-share-revoke").click();
    await page.getByTestId("summary-share-revoke-confirm").click();
    await expect(page.getByTestId("summary-share-row")).toHaveAttribute(
      "data-status",
      "revoked",
    );
    await outside.reload();
    await expect(outside.getByTestId("share-unavailable")).toContainText(
      messages.en.summary.unavailableTitle,
    );
  } finally {
    await stranger.close();
  }
});
