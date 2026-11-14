import { expect, type Page, test } from "@playwright/test";
import {
  GENERIC_OPERATION_SECTORS,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";
import { openQuickAdd } from "./support/tasks";

// Spec OT-1/OT-2 on the phone (Pixel 7 projects, i.e. H5): the 營運視圖
// regroups tagged tasks by sector and project, hides untagged tasks, and a
// task added from Quick Add with a sector tag appears and opens.
test.use({ actionTimeout: 15000 });

test("sector view regroups tagged tasks across projects and opens them on a phone", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const [finance, customers, operations] = GENERIC_OPERATION_SECTORS;
  const project = async (name: string) =>
    projectSchema.parse(
      await (
        await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
          data: { name },
        })
      ).json(),
    );
  const alpha = await project("Sector alpha");
  const beta = await project("Sector beta");
  const task = async (title: string, labels: string[], projectId: string) =>
    taskSchema.parse(
      await (
        await page.request.post("/api/tasks", {
          data: {
            workspaceId: workspace.id,
            title,
            labels,
            projectId,
            ownerId: workspace.memberId,
          },
        })
      ).json(),
    );
  const receivables = await task(
    "Chase overdue receivables",
    [finance.label],
    alpha.id,
  );
  await task("Untagged housekeeping", ["urgent"], alpha.id);
  await task("Pipeline review", [customers.label, finance.label], beta.id);

  await page.goto(`/projects/${alpha.id}`);
  await page.getByTestId("project-view-more").click();
  await page.getByTestId("project-view-sectors").click();
  await expect(page).toHaveURL(/view=sectors/);
  await expect(page.getByTestId("sector-view-hint")).toHaveText(
    m.projects.sectorsHint,
  );
  await expect(page.getByTestId("project-meta")).toHaveCount(0);
  const groups = page.getByTestId("sector-group");
  await expect(groups).toHaveCount(6);
  await expect(groups.first()).toContainText(finance.leading);
  await expect(groups.first()).toContainText(finance.result);
  const group = (label: string) =>
    page.locator(`[data-testid="sector-group"][data-sector="${label}"]`);
  const titles = (label: string) =>
    group(label).getByTestId("board-task").locator(".task-title-link");
  // Tasks from both projects regroup under the sector, with project headings.
  // Groups follow project order (alpha before beta) whatever the task sort.
  await expect(titles(finance.label)).toHaveText([
    "Chase overdue receivables",
    "Pipeline review",
  ]);
  await expect(group(finance.label).getByTestId("sector-project")).toHaveText([
    "Sector alpha",
    "Sector beta",
  ]);
  await expect(titles(customers.label)).toHaveText(["Pipeline review"]);
  await expect(page.getByText("Untagged housekeeping")).toHaveCount(0);
  await expect(titles(operations.label)).toHaveCount(0);

  await addTaggedTask(page, "Capacity check", operations.label);
  await expect(titles(operations.label)).toHaveText(["Capacity check"]);

  await group(finance.label)
    .getByRole("link", { name: receivables.title, exact: true })
    .click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(
    receivables.title,
  );
});

/** Quick Add on the phone with a `+label` sector tag. */
async function addTaggedTask(page: Page, title: string, label: string) {
  await openQuickAdd(page);
  await page.getByTestId("quick-text").fill(`${title} +${label}`);
  await page.getByTestId("quick-parse").click();
  await expect(page.getByTestId("quick-title")).toHaveValue(title);
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/tasks",
  );
  await page.getByTestId("quick-create").click();
  const task = taskSchema.parse(await (await created).json());
  expect(task.labels).toEqual([label]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
