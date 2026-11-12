import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { projectSchema } from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";

// ADR 0031, VE-3: a person exports the project view and the workspace
// overview as one optimized PNG, previews it, sends it through the system
// share sheet, copies it and saves it. Runs in en, zh-CN and zh-HK.
test.use({ actionTimeout: 15000 });

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Records what the page hands to the system share sheet. */
async function stubShareSheet(page: Page) {
  await page.addInitScript(() => {
    const shared: { name: string; type: string; size: number }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data?: { files?: File[] }) =>
        !!data?.files?.every((file) => file.type === "image/png"),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files: File[] }) => {
        for (const file of data.files)
          shared.push({ name: file.name, type: file.type, size: file.size });
      },
    });
  });
}

async function openExport(page: Page, title: string) {
  await page.getByTestId("view-export-open").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("view-export-preview")).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() =>
      page
        .getByTestId("view-export-preview")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1080);
  await expect(page.getByTestId("view-export-size")).toContainText("1080 px");
  return dialog;
}

async function save(page: Page, kind: "project" | "workspace") {
  const pending = page.waitForEvent("download");
  await page.getByTestId("view-export-save").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^taff-${kind}-\\d{4}-\\d{2}-\\d{2}-[a-f0-9]{8}\\.png$`),
  );
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  // The delivery cap from ADR 0029: small enough for chat apps.
  expect(bytes.byteLength).toBeLessThanOrEqual(400 * 1024);
  return bytes;
}

test("a person exports, sends, copies and saves project and workspace images", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await stubShareSheet(page);
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Export ${locale} ${Date.now()}` } },
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
          title: `Pack the samples ${locale}`,
          projectId: project.id,
        },
      })
    ).status(),
  ).toBe(201);

  // The project view: preview, send, copy, save.
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  const dialog = await openExport(page, m.viewExport.title);
  await page.getByTestId("view-export-send").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as never as { __shared: unknown[] }).__shared,
      ),
    )
    .toEqual([
      {
        name: expect.stringMatching(/^taff-project-.*\.png$/),
        type: "image/png",
        size: expect.any(Number),
      },
    ]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("view-export-copy").click();
  await expect(page.getByTestId("toast")).toContainText(m.viewExport.copied);
  await save(page, "project");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("view-export-open")).toBeFocused();

  // The workspace overview (all projects) exports every active project.
  await page.goto("/projects?all=1");
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  await openExport(page, m.viewExport.title);
  await save(page, "workspace");

  // The API answers only with the caller's own rights and a valid query.
  const forbidden = await page.request.get(
    `/api/workspaces/${crypto.randomUUID()}/view-image?locale=${locale}`,
  );
  expect([403, 404]).toContain(forbidden.status());
  const invalid = await page.request.get(
    `/api/workspaces/${workspace.id}/view-image?locale=xx`,
  );
  expect(invalid.status()).toBe(400);
});
