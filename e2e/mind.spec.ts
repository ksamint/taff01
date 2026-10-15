import { expect, type Page, test } from "@playwright/test";
import {
  meSchema,
  projectSchema,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { type MindMap, mindMapSchema } from "../packages/schemas/src/mind";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";
import { holdRequest } from "./support/routes";

// M18 mind map: nodes, links, sources and evidence are created and edited
// from the keyboard (list and panel) and the canvas; every change toasts
// with an undo that calls the inverse API; "Turn into a validation task"
// creates a real task owned by the signed-in person.
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
    data: { name: `Mind ${locale} ${Date.now()}` },
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
async function mind(page: Page, workspace: Workspace): Promise<MindMap> {
  const response = await page.request.get(
    `/api/workspaces/${workspace.id}/mind`,
  );
  expect(response.status()).toBe(200);
  return mindMapSchema.parse(await response.json());
}
async function addNode(
  page: Page,
  workspace: Workspace,
  body: { title: string; layer: number; angle: number; note?: string },
) {
  const response = await page.request.post(
    `/api/workspaces/${workspace.id}/mind/nodes`,
    { data: body },
  );
  expect(response.status()).toBe(201);
}
/** Fills `{{name}}` placeholders the way i18next does. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
const nodeByTitle = (map: MindMap, title: string) => {
  const node = map.nodes.find((item) => item.title === title);
  if (!node) throw new Error(`No node ${title}`);
  return node;
};

test("create nodes and links by keyboard, edit and archive with undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Insight ${locale}`);
  await page.goto(`/projects/${project.id}?view=mind`);
  await expect(page.getByTestId("mind-view")).toBeVisible();
  await expect(page.getByTestId("mind-empty")).toBeVisible();
  const toast = page.getByTestId("toast");

  // Create two nodes from the form (keyboard only inside the dialog).
  await page.getByTestId("mind-new-node").click();
  const form = page.getByTestId("mind-node-form");
  await expect(form).toBeVisible();
  // Submitting without a title explains what is missing.
  await page.getByTestId("mind-node-save").click();
  await expect(form.getByRole("alert")).toHaveText(m.mind.form.required);
  await page.getByTestId("mind-node-title").fill(`歸屬感 ${locale}`);
  await page.getByTestId("mind-node-momentum").selectOption("1");
  await page.getByTestId("mind-node-note").fill("Being recognised matters.");
  await page.getByTestId("mind-node-title").press("Enter");
  await expect(toast).toContainText(
    fill(m.mind.toast.nodeCreated, { title: `歸屬感 ${locale}` }),
  );
  await expect(page.getByTestId("mind-detail-title")).toHaveText(
    `歸屬感 ${locale}`,
  );
  await expect(page.getByTestId("mind-detail-title")).toBeFocused();
  await expect(page.getByTestId("mind-note")).toHaveText(
    "Being recognised matters.",
  );
  await expect(page.getByTestId("mind-no-evidence")).toHaveText(
    m.mind.noEvidence,
  );

  await page.getByTestId("mind-new-node").click();
  await page.getByTestId("mind-node-title").fill(`Nostalgia ${locale}`);
  await page.getByTestId("mind-node-layer").selectOption("1");
  await page.getByTestId("mind-node-save").click();
  await expect(page.getByTestId("mind-detail-title")).toHaveText(
    `Nostalgia ${locale}`,
  );
  let map = await mind(page, workspace);
  expect(map.nodes).toHaveLength(2);
  const root = nodeByTitle(map, `歸屬感 ${locale}`);
  const child = nodeByTitle(map, `Nostalgia ${locale}`);
  expect(child).toMatchObject({ layer: 1, strength: 3, momentum: 0 });
  // The canvas draws both nodes.
  await expect(page.getByTestId("mind-node")).toHaveCount(2);

  // The list reaches every node by keyboard; ↓ moves, Enter opens detail.
  await page.getByTestId("mind-back").click();
  await expect(page.getByTestId("mind-overview")).toBeVisible();
  await page.getByTestId("mind-as-list").click();
  const rows = page.getByTestId("mind-list-node");
  await expect(rows).toHaveCount(2);
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mind-detail-title")).toBeFocused();
  await expect(page.getByTestId("mind-detail-title")).toHaveText(root.title);

  // Link the root to the child as "supports" from the panel form.
  await page.getByTestId("mind-add-link-direction").selectOption("out");
  await page.getByTestId("mind-add-link-target").selectOption(child.id);
  await page.getByTestId("mind-add-link-kind").selectOption("supports");
  await page.getByTestId("mind-add-link-submit").click();
  await expect(toast).toContainText(m.mind.toast.edgeAdded);
  await expect
    .poll(async () => (await mind(page, workspace)).edges)
    .toMatchObject([
      { fromNodeId: root.id, toNodeId: child.id, kind: "supports" },
    ]);
  await expect(page.getByTestId("mind-to-node")).toHaveText(
    new RegExp(child.title),
  );

  // Change the kind, then undo through PATCH with the new version.
  await page.getByTestId("mind-link-kind").selectOption("contradicts");
  await expect(toast).toContainText(
    fill(m.mind.toast.edgeChanged, { kind: m.mind.edgeKind.contradicts }),
  );
  await expect
    .poll(async () => (await mind(page, workspace)).edges[0]?.kind)
    .toBe("contradicts");
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => (await mind(page, workspace)).edges[0])
    .toMatchObject({ kind: "supports", version: 3 });

  // Remove the link, then undo re-creates it.
  await page.getByTestId("mind-link-remove").click();
  await expect(toast).toContainText(m.mind.toast.edgeRemoved);
  await expect
    .poll(async () => (await mind(page, workspace)).edges.length)
    .toBe(0);
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => (await mind(page, workspace)).edges)
    .toMatchObject([
      { fromNodeId: root.id, toNodeId: child.id, kind: "supports" },
    ]);

  // Edit the node; undo PATCHes the previous fields back.
  await page.getByTestId("mind-edit-node").click();
  await expect(page.getByTestId("mind-node-title")).toHaveValue(root.title);
  await page.getByTestId("mind-node-strength").selectOption("5");
  await page.getByTestId("mind-node-save").click();
  await expect(toast).toContainText(
    fill(m.mind.toast.nodeSaved, { title: root.title }),
  );
  await expect(page.getByTestId("mind-strength")).toHaveAttribute(
    "aria-valuenow",
    "5",
  );
  await expect
    .poll(async () => nodeByTitle(await mind(page, workspace), root.title))
    .toMatchObject({ strength: 5 });
  // Hold the map refetch the undo starts, so Archive below runs before it
  // lands: the undo's own response must already carry version 3, or the
  // archive is rejected as changed elsewhere (the first-attempt flake).
  const refetch = await holdRequest(
    page,
    `/api/workspaces/${workspace.id}/mind`,
    {
      method: "GET",
      reply: "continue",
    },
  );
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => nodeByTitle(await mind(page, workspace), root.title))
    .toMatchObject({ strength: 3, version: 3 });

  // Archive (admins), then undo restores it with its link.
  try {
    await page.getByTestId("mind-archive-node").click();
    await expect(toast).toContainText(
      fill(m.mind.toast.nodeArchived, { title: root.title }),
    );
  } finally {
    refetch.release();
  }
  await expect
    .poll(async () => (await mind(page, workspace)).nodes.length)
    .toBe(1);
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => {
      const after = await mind(page, workspace);
      return [after.nodes.length, after.edges.length];
    })
    .toEqual([2, 1]);

  // Back on the canvas, clicking a node opens its detail.
  await page.getByTestId("mind-as-list").click();
  await page
    .locator(`[data-testid="mind-node"][data-id="${child.id}"]`)
    .click();
  await expect(page.getByTestId("mind-detail-title")).toHaveText(child.title);
  await expect(page.getByTestId("mind-from-node")).toHaveText(
    new RegExp(root.title),
  );
});

test("sources become evidence, with undo", async ({ page }, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Evidence ${locale}`);
  await addNode(page, workspace, {
    title: `療癒 ${locale}`,
    layer: 0,
    angle: 135,
  });
  await page.goto(`/projects/${project.id}?view=mind`);
  await expect(page.getByTestId("mind-overview")).toBeVisible();
  await expect(page.getByTestId("mind-coverage")).toHaveText(
    fill(m.mind.coverage, { cited: 0, total: 1 }),
  );
  const toast = page.getByTestId("toast");

  // A new source from the toolbar; a bad URL is explained first.
  await page.getByTestId("mind-new-source").click();
  await page.getByTestId("mind-source-title").fill("Troisi & Gabriel (2011)");
  await page.getByTestId("mind-source-url").fill("javascript:alert(1)");
  await page.getByTestId("mind-source-save").click();
  await expect(
    page.getByTestId("mind-source-form").getByRole("alert"),
  ).toHaveText(m.mind.form.urlError);
  await page
    .getByTestId("mind-source-url")
    .fill("https://doi.org/10.1177/0956797611407931");
  await page
    .getByTestId("mind-source-note")
    .fill("Comfort food and belonging.");
  await page.getByTestId("mind-source-save").click();
  await expect(toast).toContainText(
    fill(m.mind.toast.sourceCreated, { title: "Troisi & Gabriel (2011)" }),
  );
  const source = page.getByTestId("mind-source");
  await expect(source).toHaveCount(1);
  await expect(source.getByTestId("mind-source-link")).toHaveAttribute(
    "href",
    "https://doi.org/10.1177/0956797611407931",
  );
  await expect(source.getByTestId("mind-source-link")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );

  // Add it as evidence to the node from the panel.
  await page.getByTestId("mind-as-list").click();
  await page.getByTestId("mind-list-node").first().click();
  await expect(page.getByTestId("mind-no-evidence")).toBeVisible();
  const map = await mind(page, workspace);
  const node = map.nodes[0]!;
  const created = map.sources[0]!;
  await page.getByTestId("mind-add-evidence").selectOption(created.id);
  await page.getByTestId("mind-add-evidence-submit").click();
  await expect(toast).toContainText(
    fill(m.mind.toast.evidenceAdded, {
      source: created.title,
      title: node.title,
    }),
  );
  await expect(page.getByTestId("mind-evidence-item")).toHaveCount(1);
  await expect
    .poll(async () => (await mind(page, workspace)).nodeSources.length)
    .toBe(1);

  // Remove it, then undo puts it back.
  await page.getByTestId("mind-evidence-remove").click();
  await expect(toast).toContainText(
    fill(m.mind.toast.evidenceRemoved, {
      source: created.title,
      title: node.title,
    }),
  );
  await expect
    .poll(async () => (await mind(page, workspace)).nodeSources.length)
    .toBe(0);
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => (await mind(page, workspace)).nodeSources.length)
    .toBe(1);

  // A new source from the node is linked as its evidence at once. Its map
  // refetch is held until the edit form below is open, so the form must get
  // the saved row (real id and version), not the optimistic one.
  const refetch = await holdRequest(
    page,
    `/api/workspaces/${workspace.id}/mind`,
    {
      method: "GET",
      reply: "continue",
    },
  );
  try {
    await page.getByTestId("mind-new-evidence").click();
    await page.getByTestId("mind-source-title").fill("Census 2021");
    await page.getByTestId("mind-source-save").click();
    await expect(page.getByTestId("mind-evidence-item")).toHaveCount(2);
    await expect
      .poll(async () => (await mind(page, workspace)).nodeSources.length)
      .toBe(2);

    // Edit a source from the overview; undo restores the old title.
    await page.getByTestId("mind-back").click();
    await expect(page.getByTestId("mind-coverage")).toHaveText(
      fill(m.mind.coverage, { cited: 1, total: 1 }),
    );
    await page
      .getByTestId("mind-source")
      .filter({ hasText: "Census 2021" })
      .getByTestId("mind-source-edit")
      .click();
    await page.getByTestId("mind-source-title").fill("C&SD Census 2021");
  } finally {
    refetch.release();
  }
  await page.getByTestId("mind-source-save").click();
  await expect(toast).toContainText(
    fill(m.mind.toast.sourceSaved, { title: "C&SD Census 2021" }),
  );
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () =>
      (await mind(page, workspace)).sources.map((s) => s.title).sort(),
    )
    .toEqual(["Census 2021", "Troisi & Gabriel (2011)"]);
});

test("turn a node into a validation task owned by the person", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const project = await createProject(page, workspace, `Validate ${locale}`);
  await addNode(page, workspace, {
    title: `深夜一人餐 ${locale}`,
    layer: 3,
    angle: 212,
    note: "Late-night bar seating.",
  });
  await page.goto(`/projects/${project.id}?view=mind`);
  await page.getByTestId("mind-as-list").click();
  await page.getByTestId("mind-list-node").first().click();
  await page.getByTestId("mind-make-task").click();
  const form = page.getByTestId("mind-task-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("mind-task-title")).toHaveValue(
    fill(m.mind.validateTitle, { title: `深夜一人餐 ${locale}` }),
  );
  await expect(page.getByTestId("mind-task-project")).toHaveValue(project.id);
  const due = await page.getByTestId("mind-task-due").inputValue();
  expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByTestId("mind-task-save").click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(m.mind.toast.taskMade.split("{{")[0]!);
  await expect(page.getByTestId("mind-tasked")).toBeVisible();
  await expect(page.getByTestId("mind-make-task")).toHaveCount(0);

  const node = (await mind(page, workspace)).nodes[0]!;
  expect(node.taskId).not.toBeNull();
  const task = taskSchema.parse(
    await (await page.request.get(`/api/tasks/${node.taskId}`)).json(),
  );
  expect(task).toMatchObject({
    title: fill(m.mind.validateTitle, { title: `深夜一人餐 ${locale}` }),
    ownerId: workspace.memberId,
    workerId: null,
    projectId: project.id,
    description: "Late-night bar seating.",
  });
  expect(task.dueAt).not.toBeNull();

  // The panel opens the real task.
  await page.getByTestId("mind-open-task").click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}`));
  await expect(page.getByTestId("task-detail-heading")).toBeVisible();
});
