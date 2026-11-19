import { expect, type Page, test } from "@playwright/test";
import {
  GENERIC_OPERATION_SECTORS,
  projectSchema,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";
import { openProjectFilters } from "./support/task-fields";
import { openQuickAdd } from "./support/tasks";

// Spec OT-1/OT-2 on the phone (Pixel 7 projects, i.e. H5): the 營運視圖
// regroups tagged tasks by sector and project, hides untagged tasks, and a
// task added from Quick Add with a sector tag appears and opens.
test.use({ actionTimeout: 15000 });

test("sector view regroups tagged tasks across projects and opens them on a phone", async ({
  page,
  browser,
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
  await page.goto("/projects?view=sectors");
  await expect(page.getByTestId("sector-view-hint")).toHaveText(
    m.projects.sectorsHint,
  );
  await expect(page.getByTestId("sector-group")).toHaveCount(0);

  const receivables = await task(
    "Chase overdue receivables",
    [finance.label],
    alpha.id,
  );
  await task("Untagged housekeeping", ["urgent"], alpha.id);
  await task("Pipeline review", [customers.label, finance.label], beta.id);

  await page.goto(`/projects/${alpha.id}`);
  await page.getByTestId("project-view-more").click();
  await expect(page.getByTestId("project-view-sectors")).toHaveCount(0);

  await page.goto(`/projects/${alpha.id}?view=sectors`);
  await expect(page.getByTestId("sector-view-hint")).toBeVisible();
  await page.goto("/projects");
  await page.getByTestId("project-view-more").click();
  await page.getByTestId("project-view-sectors").click();
  await expect(page).toHaveURL("/projects?view=sectors");
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

  const desktop = await browser.newPage({
    baseURL: process.env.AUTH_URL,
    storageState: await page.context().storageState(),
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
  });
  try {
    await desktop.goto("/projects?view=sectors");
    await expect(desktop.getByTestId("sector-group")).toHaveCount(6);
    const columns = desktop.locator(".projects-sectors");
    await expect(columns).toHaveCSS("grid-template-columns", /^(\S+ ){2}\S+$/);
    const label = columns.locator(".projects-sector-indicators dt");
    expect(
      await label.evaluateAll(
        (terms) =>
          new Set(terms.map((term) => term.getBoundingClientRect().width)).size,
      ),
    ).toBe(1);
  } finally {
    await desktop.close();
  }

  await group(finance.label)
    .getByRole("link", { name: receivables.title, exact: true })
    .click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(
    receivables.title,
  );
});

test("XIDING setup tasks follow template order on Board and Today despite different creation times", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  await freshAccount(page, locale);
  const response = await page.request.post("/api/workspaces", {
    data: { name: "XIDING" },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  const project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: { name: "營運設置 Operation setup" },
      })
    ).json(),
  );
  const setup = [];
  for (const { label } of GENERIC_OPERATION_SECTORS) {
    const created = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        ownerId: workspace.memberId,
        title: `設定指標目標 · ${label}`,
        labels: [label],
      },
    });
    expect(created.status()).toBe(201);
    setup.push(taskSchema.parse(await created.json()));
  }
  expect(new Set(setup.map(({ createdAt }) => createdAt)).size).toBeGreaterThan(
    1,
  );
  const titles = setup.map(({ title }) => title);
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();

  await page.goto(`/projects/${project.id}`);
  const cards = page.getByTestId("board-column-todo").getByTestId("board-task");
  await expect(cards.locator(".task-title-link")).toHaveText(titles);
  await openProjectFilters(page);
  await page.getByTestId("project-sort").selectOption("created");
  await page.keyboard.press("Escape");
  await expect(cards.locator(".task-title-link")).toHaveText(
    [...titles].reverse(),
  );

  await page.goto("/");
  const undated = page.getByTestId("today-undated");
  await undated.locator("summary").click();
  await expect(
    undated.getByTestId("task-card").locator(".today-task-title"),
  ).toHaveText(titles);
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
