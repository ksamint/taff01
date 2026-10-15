import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  meSchema,
  projectSchema,
  type Task,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { type Timeline, timelineSchema } from "../packages/schemas/src/plan";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";

// M16 timeline and relations graph: drags and their keyboard/form
// alternatives call the plan and dependency APIs, every change toasts with
// an undo that calls the inverse API, and the graph opens tasks.
test.use({ actionTimeout: 15000 });

type Workspace = { id: string; memberId: string };

/** Signs in as the admin demo user and opens a new workspace they own. */
async function setUp(page: Page, locale: TestLocale): Promise<Workspace> {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  const response = await page.request.post("/api/workspaces", {
    data: { name: `Plan ${locale} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const member = me.workspaces.find((item) => item.id === workspace.id);
  expect(member?.role).toBe("admin");
  return { id: workspace.id, memberId: member!.memberId };
}

async function createProject(page: Page, workspace: Workspace, name: string) {
  const response = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name } },
  );
  expect(response.status()).toBe(201);
  return projectSchema.parse(await response.json());
}
async function createTask(
  page: Page,
  workspace: Workspace,
  title: string,
  projectId: string,
): Promise<Task> {
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      title,
      ownerId: workspace.memberId,
      projectId,
    },
  });
  expect(response.status()).toBe(201);
  return taskSchema.parse(await response.json());
}
async function timeline(page: Page, projectId: string): Promise<Timeline> {
  const response = await page.request.get(
    `/api/projects/${projectId}/timeline`,
  );
  expect(response.status()).toBe(200);
  return timelineSchema.parse(await response.json());
}
async function plan(page: Page, taskId: string, start: string, days: number) {
  const response = await page.request.patch(`/api/tasks/${taskId}/plan`, {
    data: { startDate: start, durationDays: days },
  });
  expect(response.status()).toBe(200);
}
function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
const dates = async (page: Page, projectId: string, taskId: string) => {
  const item = (await timeline(page, projectId)).items.find(
    (entry) => entry.id === taskId,
  );
  return item ? { start: item.start, days: item.durationDays } : null;
};
const links = async (page: Page, projectId: string) =>
  (await timeline(page, projectId)).dependencies
    .map((dep) => `${dep.from.id}>${dep.to.id}`)
    .sort();

/** Presses at the centre of `from` and releases `dx` pixels to the right. */
async function dragBy(page: Page, from: Locator, dx: number) {
  const box = await from.boundingBox();
  if (!box) throw new Error("Nothing to drag");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}
/** Presses at the centre of `from` and releases over the centre of `to`. */
async function dragTo(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("Nothing to drag");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}
const bar = (page: Page, id: string) =>
  page.locator(`[data-testid="timeline-bar"][data-id="${id}"]`);
const row = (page: Page, id: string) =>
  page.locator(`[data-testid="timeline-row"][data-id="${id}"]`);

/** Day width on the phone layout (Pixel 7) at day zoom. */
const DAY = 24;

test("move and resize bars by mouse and by the form, with undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Launch ${locale}`);
  const design = await createTask(
    page,
    workspace,
    `設計 ${locale}`,
    project.id,
  );
  const build = await createTask(
    page,
    workspace,
    `Build ${locale}`,
    project.id,
  );
  const { today } = await timeline(page, project.id);
  await plan(page, design.id, today, 2);
  await plan(page, build.id, addDays(today, 3), 2);

  await page.goto(`/projects/${project.id}?view=timeline`);
  await expect(page.getByTestId("timeline-view")).toBeVisible();
  await expect(bar(page, design.id)).toHaveAttribute("data-start", today);
  await expect(row(page, design.id)).toHaveAccessibleName(
    new RegExp(design.title),
  );

  // Move by mouse two days to the right, then undo through the inverse API.
  await dragBy(
    page,
    bar(page, design.id).getByTestId("timeline-bar-body"),
    DAY * 2,
  );
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(m.timeline.rescheduled);
  await expect
    .poll(() => dates(page, project.id, design.id))
    .toEqual({ start: addDays(today, 2), days: 2 });
  await expect(bar(page, design.id)).toHaveAttribute(
    "data-start",
    addDays(today, 2),
  );
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(() => dates(page, project.id, design.id))
    .toEqual({ start: today, days: 2 });
  await expect(bar(page, design.id)).toHaveAttribute("data-start", today);

  // Resize the right edge by two days.
  await dragBy(
    page,
    bar(page, design.id).getByTestId("timeline-bar-resize"),
    DAY * 2,
  );
  await expect(toast).toContainText(m.timeline.resized);
  await expect
    .poll(() => dates(page, project.id, design.id))
    .toEqual({ start: today, days: 4 });
  await expect(bar(page, design.id)).toHaveAttribute(
    "data-end",
    addDays(today, 3),
  );

  // Keyboard: arrow keys move the selection; the footer edits the dates.
  await row(page, design.id).click();
  await expect(row(page, design.id)).toHaveAttribute("aria-pressed", "true");
  await row(page, design.id).press("ArrowDown");
  await expect(row(page, build.id)).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, build.id)).toBeFocused();
  const footer = page.getByTestId("timeline-footer");
  await expect(footer).toContainText(build.title);
  await footer.getByTestId("timeline-start").fill(addDays(today, 5));
  await footer.getByTestId("timeline-duration").fill("3");
  await footer.getByTestId("timeline-save").click();
  await expect(toast).toContainText(m.timeline.rescheduled);
  await expect
    .poll(() => dates(page, project.id, build.id))
    .toEqual({ start: addDays(today, 5), days: 3 });
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(() => dates(page, project.id, build.id))
    .toEqual({ start: addDays(today, 3), days: 2 });
});

test("add dependencies by drag, link mode and form; remove with undo; a cycle is rejected", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Release ${locale}`);
  const a = await createTask(page, workspace, `Spec ${locale}`, project.id);
  const b = await createTask(page, workspace, `代碼 ${locale}`, project.id);
  const c = await createTask(page, workspace, `Ship ${locale}`, project.id);
  const { today } = await timeline(page, project.id);
  await plan(page, a.id, today, 2);
  await plan(page, b.id, addDays(today, 3), 2);
  await plan(page, c.id, addDays(today, 6), 2);
  const ab = `${a.id}>${b.id}`;
  const bc = `${b.id}>${c.id}`;
  const ac = `${a.id}>${c.id}`;

  await page.goto(`/projects/${project.id}?view=timeline`);
  await expect(page.getByTestId("timeline-view")).toBeVisible();
  const toast = page.getByTestId("toast");

  // Drag from the dot at the end of A onto B.
  await dragTo(
    page,
    bar(page, a.id).getByTestId("timeline-bar-link"),
    bar(page, b.id).getByTestId("timeline-bar-body"),
  );
  await expect(toast).toContainText(m.timeline.depAdded);
  await expect.poll(() => links(page, project.id)).toEqual([ab]);

  // Link mode: B then C adds B → C; C then A would close a loop (409).
  await page.getByTestId("timeline-link-mode").click();
  await expect(page.getByTestId("timeline-link-hint")).toBeVisible();
  await bar(page, b.id).getByTestId("timeline-bar-body").click();
  await bar(page, c.id).getByTestId("timeline-bar-body").click();
  await expect(toast).toContainText(m.timeline.depAdded);
  await expect.poll(() => links(page, project.id)).toEqual([ab, bc].sort());
  await bar(page, c.id).getByTestId("timeline-bar-body").click();
  await bar(page, a.id).getByTestId("timeline-bar-body").click();
  await expect(toast).toContainText(m.timeline.cycle);
  await expect.poll(() => links(page, project.id)).toEqual([ab, bc].sort());
  await expect(
    page.locator(`[data-testid="timeline-dependency"][data-from="${c.id}"]`),
  ).toHaveCount(0);
  await page.getByTestId("timeline-link-mode").click();
  await expect(page.getByTestId("timeline-link-hint")).toHaveCount(0);

  // Click the A → B arrow next to B's start to remove it; undo re-adds it.
  // The arrow ends on B's row just before B's bar, clear of any handle.
  const target = await bar(page, b.id)
    .getByTestId("timeline-bar-body")
    .boundingBox();
  if (!target) throw new Error("No bar");
  await expect(
    page
      .locator(
        `[data-testid="timeline-dependency"][data-from="${a.id}"][data-to="${b.id}"]`,
      )
      .getByTestId("timeline-dependency-hit"),
  ).toHaveCount(1);
  await page.mouse.click(target.x - 6, target.y + target.height / 2);
  await expect(toast).toContainText(m.timeline.depRemoved);
  await expect.poll(() => links(page, project.id)).toEqual([bc]);
  await toast.getByTestId("toast-action").click();
  await expect.poll(() => links(page, project.id)).toEqual([ab, bc].sort());
  await expect(
    page.locator(
      `[data-testid="timeline-dependency"][data-from="${a.id}"][data-to="${b.id}"]`,
    ),
  ).toHaveCount(1);

  // The form alternative: add A as C's predecessor, then remove it.
  await row(page, c.id).click();
  const footer = page.getByTestId("timeline-footer");
  await footer.getByTestId("timeline-add-predecessor").selectOption(a.id);
  await footer.getByTestId("timeline-add-predecessor-submit").click();
  await expect(toast).toContainText(m.timeline.depAdded);
  await expect.poll(() => links(page, project.id)).toEqual([ab, ac, bc].sort());
  const predecessor = footer
    .getByTestId("timeline-predecessor")
    .filter({ hasText: a.title });
  await expect(predecessor).toHaveCount(1);
  await predecessor.getByTestId("timeline-predecessor-remove").click();
  await expect(toast).toContainText(m.timeline.depRemoved);
  await expect.poll(() => links(page, project.id)).toEqual([ab, bc].sort());
});

test("open a task from the relations graph and via the list", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Graph ${locale}`);
  const first = await createTask(page, workspace, `調研 ${locale}`, project.id);
  const second = await createTask(
    page,
    workspace,
    `Pilot ${locale}`,
    project.id,
  );
  const response = await page.request.post("/api/dependencies", {
    data: { predecessorTaskId: first.id, successorTaskId: second.id },
  });
  expect(response.status()).toBe(201);

  await page.goto(`/projects/${project.id}?view=relations`);
  const view = page.getByTestId("relations-view");
  await expect(view).toBeVisible();
  const node = page.locator(
    `[data-testid="relations-node"][data-key="task:${second.id}"]`,
  );
  await expect(node).toHaveCount(1);
  await page.getByTestId("relations-layout-force").click();
  await page.getByTestId("relations-layout-layered").click();
  await page.getByTestId("relations-fit").click();
  await node.getByTestId("relations-node-hit").click();
  const inspector = page.getByTestId("relations-inspector");
  await expect(
    inspector.getByTestId("relations-inspector-title"),
  ).toContainText(second.title);
  // A selected label remains above overlapping nodes at the supported minimum zoom.
  const selectedPosition = await node.getAttribute("transform");
  for (let i = 0; i < 8; i++)
    await page.getByTestId("relations-zoom-out").click();
  await expect(page.locator(".relations-svg > g")).toHaveAttribute(
    "transform",
    /scale\(0\.25\)/,
  );
  await expect(page.getByTestId("relations-node").last()).toHaveAttribute(
    "data-key",
    `task:${second.id}`,
  );
  await expect(node).toHaveAttribute("transform", selectedPosition!);
  const selectedLabel = node.locator(".relations-label");
  await expect(selectedLabel).toBeVisible();
  const screenStroke = await selectedLabel.evaluate((element) => {
    const label = element as SVGTextElement;
    const matrix = label.getScreenCTM();
    if (!matrix) throw new Error("Selected label screen matrix unavailable");
    return (
      Number.parseFloat(getComputedStyle(label).strokeWidth) *
      Math.hypot(matrix.a, matrix.b)
    );
  });
  expect(screenStroke).toBeCloseTo(3, 1);
  // Zoom back above the label threshold: dimming marks relationships without
  // fading still-interactive text or its opaque halo.
  for (let i = 0; i < 4; i++)
    await page.getByTestId("relations-zoom-in").click();
  await expect(page.locator(".relations-svg > g")).toHaveAttribute(
    "transform",
    /scale\(0\.61035/,
  );
  const dimmed = page.locator(".relations-node.is-dim");
  await expect(dimmed.first()).toBeVisible();
  await expect(dimmed.first()).toHaveCSS("opacity", "1");
  await expect(dimmed.first().locator(".relations-marker")).toHaveCSS(
    "opacity",
    "0.3",
  );
  const dimmedLabels = dimmed.locator(".relations-label");
  await expect(dimmedLabels.first()).toBeVisible();
  expect(
    await dimmedLabels.evaluateAll((labels) =>
      labels.every((label) => {
        let opacity = 1;
        for (let node: Element | null = label; node; node = node.parentElement)
          opacity *= Number(getComputedStyle(node).opacity);
        return opacity === 1 && getComputedStyle(label).fillOpacity === "1";
      }),
    ),
  ).toBe(true);
  await page.getByTestId("relations-fit").click();
  // The relations list reaches the predecessor by keyboard.
  const relation = inspector
    .getByTestId("relations-relation")
    .filter({ hasText: first.title });
  await expect(relation).toContainText(m.relations.edge.depends_on.out);
  await relation.focus();
  await page.keyboard.press("Enter");
  await expect(
    inspector.getByTestId("relations-inspector-title"),
  ).toContainText(first.title);
  await expect(
    inspector.getByTestId("relations-inspector-title"),
  ).toBeFocused();
  await inspector.getByTestId("relations-open-task").click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(first.title);

  // "As list" shows the same nodes without the canvas.
  await page.goto(`/projects/${project.id}?view=relations`);
  await page.getByTestId("relations-as-list").click();
  await expect(page.locator(".relations-svg")).toHaveCount(0);
  const item = page
    .getByTestId("relations-list-node")
    .filter({ has: page.locator("h3", { hasText: second.title }) });
  await expect(item).toContainText(m.relations.edge.depends_on.out);
  await item.getByTestId("relations-list-open-task").click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(
    second.title,
  );
});
