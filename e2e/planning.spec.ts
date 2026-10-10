import { expect, type Page, test } from "@playwright/test";
import en from "../apps/web/locales/en/common.json";
import zhCN from "../apps/web/locales/zh-CN/common.json";
import zhHK from "../apps/web/locales/zh-HK/common.json";
import {
  memberListSchema,
  meSchema,
  projectSchema,
  runSchema,
  taskCommentSchema,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { selectLocale } from "./support/preferences";
import {
  closeFieldSheet,
  closeTaskField,
  openProjectFilters,
  openTaskField,
} from "./support/task-fields";
import { closeQuickField, openQuickField } from "./support/tasks";

const messages = { en, "zh-CN": zhCN, "zh-HK": zhHK };
type Locale = keyof typeof messages;
test.use({ actionTimeout: 15000 });
async function signIn(page: Page, locale: Locale) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  return me;
}
async function freshWorkspace(page: Page, locale: Locale) {
  const response = await page.request.post("/api/workspaces", {
    data: { name: `Planning ${locale} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  return workspace;
}
async function rejectLater(page: Page, path: string, method: string) {
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== method) {
      await route.continue();
      return;
    }
    arrived();
    await gate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  return { seen, reject: () => release() };
}

test("planning edits, actual subtasks/comments, board drag, editable Quick Add and localized search", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const m = messages[locale];
  await signIn(page, locale);
  const workspace = await freshWorkspace(page, locale);
  await page.goto("/projects");
  await openProjectFilters(page);
  await page.getByTestId("new-project").click();
  const projectName = `Launch ${Date.now()}`;
  await page.getByTestId("project-name").fill(projectName);
  const projectResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/projects",
  );
  await page.getByTestId("project-submit").click();
  const project = projectSchema.parse(await (await projectResponse).json());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(`/projects/${project.id}`);
  await page.getByTestId("open-quick").click();
  const parsedTitle = `Draft ${Date.now()}`;
  const when =
    locale === "en"
      ? "tomorrow at 2:30pm !high"
      : locale === "zh-CN"
        ? "明天 下午2点半 !高"
        : "明天 下午2點半 !高";
  await page
    .getByTestId("quick-text")
    .fill(`${parsedTitle} ${when} #"${projectName}" +launch`);
  await page.getByTestId("quick-parse").click();
  await expect(page.getByTestId("quick-title")).toHaveValue(parsedTitle);
  await openQuickField(page, "project");
  await expect(page.getByTestId("quick-project")).toHaveValue(project.id);
  await closeQuickField(page, "project");
  await openQuickField(page, "priority");
  await expect(page.getByTestId("quick-priority")).toHaveValue("2");
  await closeQuickField(page, "priority");
  await openQuickField(page, "due");
  await expect(page.getByTestId("quick-time")).toHaveValue("14:30");
  await closeQuickField(page, "due");
  await openQuickField(page, "labels");
  await expect(page.getByTestId("quick-labels")).toHaveValue("launch");
  await closeQuickField(page, "labels");
  const title = `${parsedTitle} edited`;
  await page.getByTestId("quick-title").fill(title);
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/tasks",
  );
  await page.getByTestId("quick-create").click();
  const created = taskSchema.parse(await (await createdResponse).json());
  expect(created.title).toBe(title);
  expect(created.workspaceId).toBe(workspace.id);
  expect(created.projectId).toBe(project.id);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/tasks/${created.id}`);
  await openTaskField(page, "text");
  await expect(page.getByTestId("edit-title")).toBeEnabled();
  const editedTitle = `${title} final`;
  const body = `Planning description ${locale} <img src=x onerror=alert(1)>`;
  await page.getByTestId("edit-title").fill(editedTitle);
  await page.getByTestId("edit-description").fill(body);
  await closeTaskField(page, "text");
  await openTaskField(page, "priority");
  await page.getByTestId("edit-priority").selectOption("1");
  await closeTaskField(page, "priority");
  await openTaskField(page, "labels");
  await page.getByTestId("edit-labels").fill("launch, approved");
  await closeTaskField(page, "labels");
  await openTaskField(page, "due");
  await page.getByTestId("edit-date").fill("2027-01-15");
  await page.getByTestId("edit-time").fill("09:45");
  await closeTaskField(page, "due");
  const editedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/tasks/${created.id}`,
  );
  await page.getByTestId("edit-save").click();
  const acknowledgement = await editedResponse;
  expect(acknowledgement.status()).toBe(200);
  expect(taskSchema.parse(await acknowledgement.json()).description).toBe(body);
  await expect(page.getByTestId("subtask-title")).toBeEnabled();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(editedTitle);
  await expect(page.getByTestId("edit-save")).toHaveCount(0);
  const saved = taskSchema.parse(
    await (await page.request.get(`/api/tasks/${created.id}`)).json(),
  );
  expect(saved.description).toBe(body);
  expect(saved.labels).toEqual(["launch", "approved"]);
  expect(saved.priority).toBe(1);
  expect(saved.dueAt).toContain("2027-01-15");
  const childTitle = `Real subtask ${Date.now()}`;
  await page.getByTestId("subtask-title").fill(childTitle);
  const childResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/tasks",
  );
  await page.getByTestId("subtask-submit").click();
  const child = taskSchema.parse(await (await childResponse).json());
  expect(child.parentId).toBe(created.id);
  expect(child.projectId).toBe(project.id);
  expect(child.dueAt).toBe(saved.dueAt);
  await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
  const comment = `searchcomment-${locale}-${Date.now()} <script>window.e2eInjected=true</script>`;
  await page.getByTestId("task-comment").fill(comment);
  await page.getByTestId("task-comment-submit").click();
  await expect(page.locator(".review-comments")).toContainText(comment);
  expect(await page.evaluate(() => "e2eInjected" in window)).toBe(false);
  await page.reload();
  await openTaskField(page, "text");
  await expect(page.getByTestId("edit-description")).toHaveValue(body);
  await closeTaskField(page, "text");
  await openTaskField(page, "priority");
  await expect(page.getByTestId("edit-priority")).toHaveValue("1");
  await closeTaskField(page, "priority");
  await openTaskField(page, "due");
  await expect(page.getByTestId("edit-time")).toHaveValue("09:45");
  await closeTaskField(page, "due");
  await page.goto(`/projects/${project.id}`);
  await page.setViewportSize({ width: 1500, height: 1000 });
  const card = page.getByTestId("board-task").filter({
    has: page.getByRole("link", { name: editedTitle, exact: true }),
  });
  const handle = card.getByTestId("drag-handle");
  await expect(handle).toBeEnabled();
  await handle.evaluate((node) =>
    node.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  const source = await handle.boundingBox();
  const destination = await page
    .getByTestId("board-column-in_progress")
    .boundingBox();
  if (!source || !destination)
    throw new Error("Board drag geometry unavailable");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + 90,
    { steps: 12 },
  );
  const movedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/tasks/${created.id}`,
  );
  await page.mouse.up();
  const moved = await movedResponse;
  expect(moved.status()).toBe(200);
  expect(taskSchema.parse(await moved.json()).status).toBe("in_progress");
  await expect(
    page
      .getByTestId("board-column-in_progress")
      .getByRole("link", { name: editedTitle, exact: true }),
  ).toBeVisible();
  expect(
    taskSchema.parse(
      await (await page.request.get(`/api/tasks/${created.id}`)).json(),
    ).status,
  ).toBe("in_progress");
  // The fourth column is offscreen on a phone. Hold at the board edge to reveal it.
  await page.setViewportSize({ width: 393, height: 850 });
  const childCard = page
    .getByTestId("board-task")
    .filter({ has: page.getByRole("link", { name: childTitle, exact: true }) });
  const childHandle = childCard.getByTestId("drag-handle");
  await childHandle.evaluate((node) =>
    node.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  await expect(childHandle).toBeEnabled();
  const childSource = await childHandle.boundingBox();
  const board = page.locator(".planning-board");
  const boardRect = await board.boundingBox();
  if (!childSource || !boardRect)
    throw new Error("Mobile board drag geometry unavailable");
  await page.mouse.move(
    childSource.x + childSource.width / 2,
    childSource.y + childSource.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.min(390, boardRect.x + boardRect.width - 3),
    Math.max(boardRect.y + 90, childSource.y),
    { steps: 10 },
  );
  await expect
    .poll(() => board.evaluate((node) => node.scrollLeft), { timeout: 5000 })
    .toBeGreaterThan(780);
  const mobileDone = await page.getByTestId("board-column-done").boundingBox();
  if (!mobileDone) throw new Error("Mobile destination unavailable");
  await page.mouse.move(
    Math.min(365, mobileDone.x + mobileDone.width / 2),
    mobileDone.y + 90,
    { steps: 5 },
  );
  const childMovedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/tasks/${child.id}`,
  );
  await page.mouse.up();
  const childMoved = await childMovedResponse;
  expect(childMoved.status()).toBe(200);
  expect(taskSchema.parse(await childMoved.json()).status).toBe("done");
  await expect(
    page
      .getByTestId("board-column-done")
      .getByRole("link", { name: childTitle, exact: true }),
  ).toBeVisible();
  expect(
    taskSchema.parse(
      await (await page.request.get(`/api/tasks/${child.id}`)).json(),
    ).status,
  ).toBe("done");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(393);
  await page.getByTestId("project-view-list").click();
  await openProjectFilters(page);
  await page.getByTestId("project-filter").selectOption("mine");
  await page.getByTestId("project-sort").selectOption("priority");
  await page.getByTestId("project-label").fill("approved");
  await expect(page.getByTestId("board-task")).toHaveCount(1);
  await page.getByTestId("project-label").fill("");
  await closeFieldSheet(page, "project-select");
  await page.getByTestId("open-search").focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("search-input").fill(editedTitle);
  await expect(
    page.getByTestId("search-result").filter({ hasText: editedTitle }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("open-search")).toBeFocused();
  await page.getByTestId("open-search").click();
  await page.getByTestId("search-type-comment").click();
  await page.getByTestId("search-input").fill(comment.split(" ")[0]);
  await expect(page.getByTestId("search-result")).toContainText(comment);
  await page.getByTestId("search-result").first().click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(editedTitle);
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-type-settings").click();
  await page.getByTestId("search-input").fill(m.me.appearance);
  await expect(page.getByTestId("search-setting")).toContainText(
    m.me.appearance,
  );
  await page.getByTestId("search-input").press("Enter");
  await expect(page).toHaveURL(/\/me#preferences-heading$/);
  await expect(
    page.getByRole("heading", { name: m.me.preferences, exact: true }),
  ).toBeVisible();
  await page.goto(`/projects/${project.id}`);
  await page.screenshot({
    path: `/tmp/taff-m5-board-${locale}.png`,
    fullPage: true,
  });
});

test("organization creation, real invitation fragment acceptance, guest role refresh and safe last-admin rollback", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const m = messages[locale];
  await signIn(page, locale);
  await page.goto("/orgs");
  await page
    .getByRole("button", { name: m.organization.create, exact: true })
    .click();
  const orgName = `Invited team ${locale} ${Date.now()}`;
  await page.locator("#org-name").fill(orgName);
  const orgResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/workspaces",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.organization.create, exact: true })
    .click();
  const workspace = workspaceSchema.parse(await (await orgResponse).json());
  await expect(page.getByTestId(`workspace-${workspace.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: `Guest visible task ${locale}`,
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = taskSchema.parse(await taskResponse.json());
  const email = `invite-${locale}-${Date.now()}@example.test`;
  await page
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  await page.locator("#invite-email").fill(email);
  await page.locator("#invite-role").selectOption("guest");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  await expect(page.locator("#issued-invite")).toBeVisible();
  const link = await page.locator("#issued-invite").inputValue();
  const url = new URL(link);
  expect(url.pathname).toBe("/");
  expect(url.search).toBe("");
  expect(url.hash.startsWith("#invite=")).toBe(true);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.planning.close })
    .click();
  const otherContext = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    locale: locale === "en" ? "en-US" : locale,
  });
  const guest = await otherContext.newPage();
  try {
    await guest.goto(link);
    await expect(guest).toHaveURL(`${url.origin}/`);
    await guest.getByTestId("auth-toggle").click();
    await guest.locator("#auth-name").fill("Invited teammate");
    await guest.getByTestId("auth-email").fill(email);
    await guest.getByTestId("auth-password").fill("Taff-e2e-only-2026!");
    await guest.getByTestId("auth-submit").click();
    await expect(guest.getByTestId("today-heading")).toBeVisible();
    await selectLocale(guest, locale);
    await guest
      .getByRole("link", { name: m.organization.accept, exact: true })
      .click();
    await guest.getByTestId("accept-invitation").click();
    await expect(
      guest.getByTestId(`workspace-${workspace.id}`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(guest.getByTestId("accept-invitation")).toHaveCount(0);
    await guest.goto(`/tasks/${task.id}`);
    await expect(guest.getByTestId("task-field-text")).toBeDisabled();
    await expect(guest.getByTestId("task-field-due")).toBeDisabled();
    await expect(guest.getByTestId("edit-save")).toHaveCount(0);
    await expect(guest.getByTestId("task-comment-submit")).toBeDisabled();
    await expect(guest.getByTestId("task-schedule")).toBeDisabled();
    await guest.reload();
    await expect(guest.getByTestId("task-field-text")).toBeDisabled();
    await expect(guest.getByTestId("task-field-due")).toBeDisabled();
    await expect(guest.getByTestId("edit-save")).toHaveCount(0);
    const team = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    const invited = team.find(
      (item) => item.userId && item.name === "Invited teammate",
    );
    if (!invited) throw new Error("Accepted member unavailable");
    await page.reload();
    await expect(page.getByTestId(`role-${invited.id}`)).toHaveValue("guest");
    await page.getByTestId(`role-${invited.id}`).selectOption("admin");
    await expect(guest.getByTestId("task-field-text")).toBeEnabled({
      timeout: 3000,
    });
    await openTaskField(guest, "text");
    await expect(guest.getByTestId("edit-title")).toBeEnabled();
    await closeTaskField(guest, "text");
    await expect(guest.getByTestId("task-comment")).toBeEnabled();
    await expect(guest.getByTestId("task-schedule")).toBeEnabled();
    await page.getByTestId(`role-${invited.id}`).selectOption("guest");
    await expect(guest.getByTestId("task-field-text")).toBeDisabled({
      timeout: 3000,
    });
    await expect(guest.getByTestId("task-schedule")).toBeDisabled({
      timeout: 3000,
    });
    const self = page.getByTestId(`role-${workspace.memberId}`);
    await expect(self).toBeEnabled();
    await self.selectOption("guest");
    await expect(
      page.getByRole("alert").filter({ hasText: m.errors.conflict }),
    ).toBeVisible();
    await expect(self).toHaveValue("admin");
    await expect(
      page.getByRole("button", { name: m.organization.invite, exact: true }),
    ).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

test("rejected planning fields, comments, project move and invitation restore cached content", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const m = messages[locale];
  await signIn(page, locale);
  const workspace = await freshWorkspace(page, locale);
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: `Planning rollback ${Date.now()}`,
    },
  });
  const task = taskSchema.parse(await response.json());
  await page.goto(`/tasks/${task.id}`);
  let denied = await rejectLater(page, `/api/tasks/${task.id}`, "PATCH");
  await openTaskField(page, "text");
  await page.getByTestId("edit-title").fill("Rejected renamed title");
  await closeTaskField(page, "text");
  await page.getByTestId("edit-save").click();
  await denied.seen;
  await expect(page.getByTestId("task-detail-heading")).toHaveText(
    "Rejected renamed title",
  );
  denied.reject();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await openTaskField(page, "text");
  await expect(page.getByTestId("edit-title")).toHaveValue(
    "Rejected renamed title",
  );
  await closeTaskField(page, "text");
  await page.unroute(`**/api/tasks/${task.id}`);
  denied = await rejectLater(page, `/api/tasks/${task.id}/comments`, "POST");
  await page.getByTestId("task-comment").fill("Rejected task comment");
  await page.getByTestId("task-comment-submit").click();
  await denied.seen;
  await expect(page.locator(".review-comments")).toContainText(
    "Rejected task comment",
  );
  denied.reject();
  await expect(page.locator(".review-comments")).toHaveCount(0);
  await expect(page.getByTestId("task-comment")).toHaveValue(
    "Rejected task comment",
  );
  await page.goto("/projects");
  const card = page.getByTestId("board-task").filter({ hasText: task.title });
  denied = await rejectLater(page, `/api/tasks/${task.id}`, "PATCH");
  await card.locator("details > summary").click();
  await card.getByTestId("board-status").selectOption("in_progress");
  await denied.seen;
  await expect(page.getByTestId("board-column-in_progress")).toContainText(
    task.title,
  );
  denied.reject();
  await expect(page.getByTestId("board-column-todo")).toContainText(task.title);
  // Optimistic column movement remounts the card, including its collapsed menu.
  await card.locator("details > summary").click();
  await expect(card.getByTestId("board-status")).toHaveValue("todo");
  await page.goto("/orgs");
  denied = await rejectLater(
    page,
    `/api/workspaces/${workspace.id}/invites`,
    "POST",
  );
  await page
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  const email = `rejected-${Date.now()}@example.test`;
  await page.locator("#invite-email").fill(email);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  await denied.seen;
  denied.reject();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    m.errors.forbidden,
  );
  await expect(page.locator("#issued-invite")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.planning.close })
    .click();
  await expect(page.locator(".history-list")).not.toContainText(email);
});

test("concurrent edits reject stale drafts and title-only saves preserve exact DST-fold deadlines", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as Locale;
  const m = messages[locale];
  const email = `stale-edit-${locale}-${Date.now()}@example.test`;
  const password = "Taff-e2e-only-2026!";
  await page.goto("/");
  await page.getByTestId("auth-toggle").click();
  await page.locator("#auth-name").fill("Concurrent editor");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  await page.request.patch("/api/profile", {
    data: { locale, tz: "America/New_York" },
  });
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const workspace = me.workspaces[0];
  const exactDeadline = "2026-11-01T06:30:45.123Z";
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: `Concurrent ${Date.now()}`,
      description: "Original description",
      dueAt: exactDeadline,
    },
  });
  const task = taskSchema.parse(await response.json());
  await page.goto(`/tasks/${task.id}`);
  await openTaskField(page, "due");
  await expect(page.getByTestId("edit-time")).toHaveValue("01:30");
  await closeTaskField(page, "due");
  const otherContext = await browser.newContext({
    baseURL: process.env.AUTH_URL,
  });
  const other = await otherContext.newPage();
  try {
    const auth = await other.request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    expect(auth.ok()).toBe(true);
    await other.goto(`/tasks/${task.id}`);
    await openTaskField(other, "text");
    await expect(other.getByTestId("edit-title")).toBeEnabled();
    const draft = "My unsaved title draft";
    await openTaskField(page, "text");
    await page.getByTestId("edit-title").fill(draft);
    await closeTaskField(page, "text");
    await other
      .getByTestId("edit-description")
      .fill("Concurrent description from second browser");
    await closeTaskField(other, "text");
    await other.getByTestId("edit-save").click();
    await expect(other.getByTestId("edit-save")).toHaveCount(0);
    await expect(page.getByTestId("task-detail-heading")).toHaveText(
      task.title,
    );
    await expect
      .poll(
        async () =>
          taskSchema.parse(
            await (await page.request.get(`/api/tasks/${task.id}`)).json(),
          ).version,
      )
      .toBe(task.version + 1);
    // The live data refresh leaves the editor's original version and draft intact.
    await openTaskField(page, "text");
    await expect(page.getByTestId("edit-description")).toHaveValue(
      "Original description",
    );
    await closeTaskField(page, "text");
    const rejected = page.waitForResponse(
      (value) =>
        value.request().method() === "PATCH" &&
        new URL(value.url()).pathname === `/api/tasks/${task.id}`,
    );
    await page.getByTestId("edit-save").click();
    expect((await rejected).status()).toBe(409);
    await openTaskField(page, "text");
    await expect(page.getByTestId("edit-title")).toHaveValue(draft);
    await closeTaskField(page, "text");
    await expect(
      page.getByRole("alert").filter({ hasText: m.errors.conflict }),
    ).toBeVisible();
    const current = taskSchema.parse(
      await (await page.request.get(`/api/tasks/${task.id}`)).json(),
    );
    expect(current.title).toBe(task.title);
    expect(current.description).toBe(
      "Concurrent description from second browser",
    );
    expect(current.dueAt).toBe(exactDeadline);
    await page.getByTestId("edit-reload").click();
    await openTaskField(page, "text");
    await expect(page.getByTestId("edit-description")).toHaveValue(
      current.description,
    );
    await page.getByTestId("edit-title").fill("Resolved title only");
    await closeTaskField(page, "text");
    await page.getByTestId("edit-save").click();
    await expect(page.getByTestId("task-detail-heading")).toHaveText(
      "Resolved title only",
    );
    const saved = taskSchema.parse(
      await (await page.request.get(`/api/tasks/${task.id}`)).json(),
    );
    expect(saved.description).toBe(current.description);
    expect(saved.dueAt).toBe(exactDeadline);
  } finally {
    await otherContext.close();
  }
});

test("nested field Escape preserves drafts and direct tasks use their own workspace members and latest run", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as Locale;
  const m = messages[locale];
  const me = await signIn(page, locale);
  const seedMembers = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${me.workspaces[0].id}`)
    ).json(),
  );
  const originalAgent = seedMembers.find((member) => member.kind === "agent");
  if (!originalAgent)
    throw new Error("A readable agent is required for an isolated copy");
  const ambient = await freshWorkspace(page, locale);
  const createdWorkspace = await page.request.post("/api/workspaces", {
    data: {
      name: `Task scope ${locale} ${crypto.randomUUID()}`,
      agentIds: [originalAgent.id],
    },
  });
  expect(createdWorkspace.status()).toBe(201);
  const target = workspaceSchema.parse(await createdWorkspace.json());
  const targetMembers = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${target.id}`)
    ).json(),
  );
  const worker = targetMembers.find((member) => member.kind === "agent");
  if (!worker) throw new Error("Copied task worker is required");
  expect(worker.id).not.toBe(originalAgent.id);
  expect(target.memberId).not.toBe(ambient.memberId);
  const createdTask = await page.request.post("/api/tasks", {
    data: {
      workspaceId: target.id,
      ownerId: target.memberId,
      workerId: worker.id,
      title: `Cross-workspace task ${locale} ${crypto.randomUUID()}`,
    },
  });
  expect(createdTask.status()).toBe(201);
  const task = taskSchema.parse(await createdTask.json());
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${ambient.id}`).click();
  await expect(page.getByTestId(`workspace-${ambient.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  const selectedWorkspace = () =>
    page.evaluate(
      (userId) => sessionStorage.getItem(`taff:workspace:${userId}`),
      me.user.id,
    );
  await expect.poll(selectedWorkspace).toBe(ambient.id);
  await expect(page.getByTestId("task-field-worker")).toContainText(
    worker.name,
  );
  await openTaskField(page, "worker");
  await expect(page.getByTestId("detail-worker")).toHaveValue(worker.id);
  await expect(
    page.getByTestId("detail-worker").locator(`option[value="${worker.id}"]`),
  ).toHaveText(`${worker.name} · ${m.agent}`);
  await expect(
    page
      .getByTestId("detail-worker")
      .locator(`option[value="${ambient.memberId}"]`),
  ).toHaveCount(0);
  await closeTaskField(page, "worker");
  await openTaskField(page, "owner");
  await expect(page.getByTestId("edit-owner")).toHaveValue(target.memberId);
  await expect(
    page
      .getByTestId("edit-owner")
      .locator(`option[value="${ambient.memberId}"]`),
  ).toHaveCount(0);
  await closeTaskField(page, "owner");
  const metadataWrites: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/tasks/${task.id}`
    )
      metadataWrites.push(request.url());
  });
  const draft = `Escape-kept title ${locale}`;
  await openTaskField(page, "text");
  await page.getByTestId("edit-title").fill(draft);
  await page.getByTestId("edit-title").press("Escape");
  await expect(page.getByTestId("edit-title")).toHaveCount(0);
  await expect(page.locator("dialog.task-detail-sheet")).toBeVisible();
  await expect(page).toHaveURL(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await expect(page.getByTestId("task-field-text")).toBeFocused();
  await expect(page.getByTestId("edit-save")).toBeEnabled();
  await openTaskField(page, "text");
  await expect(page.getByTestId("edit-title")).toHaveValue(draft);
  await closeTaskField(page, "text");
  expect(metadataWrites).toEqual([]);
  expect(
    taskSchema.parse(
      await (await page.request.get(`/api/tasks/${task.id}`)).json(),
    ).title,
  ).toBe(task.title);
  const comment = `Task-local author ${locale} ${crypto.randomUUID()}`;
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const commentPath = `**/api/tasks/${task.id}/comments`;
  await page.route(commentPath, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    arrived();
    await gate;
    await route.continue();
  });
  try {
    const acknowledged = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/tasks/${task.id}/comments`,
    );
    await page.getByTestId("task-comment").fill(comment);
    await page.getByTestId("task-comment-submit").click();
    await seen;
    const optimistic = page
      .locator("dialog.task-detail-sheet .review-comments li")
      .filter({ hasText: comment });
    await expect(optimistic).toBeVisible();
    await expect(optimistic.locator("strong")).toHaveText(me.user.name);
    release();
    const response = await acknowledged;
    expect(response.status()).toBe(201);
    const saved = taskCommentSchema.parse(await response.json());
    expect(saved.workspaceId).toBe(target.id);
    expect(saved.authorId).toBe(target.memberId);
    await expect(page.getByTestId("task-comment")).toHaveValue("");
  } finally {
    release();
    await page.unroute(commentPath);
  }
  const firstResponse = await page.request.post(`/api/tasks/${task.id}/runs`, {
    data: {},
  });
  expect(firstResponse.status()).toBe(201);
  const first = runSchema.parse(await firstResponse.json());
  const canceled = await page.request.post(`/api/runs/${first.id}/control`, {
    data: { version: first.version, action: "cancel" },
  });
  expect(canceled.status()).toBe(200);
  const secondResponse = await page.request.post(`/api/tasks/${task.id}/runs`, {
    data: {},
  });
  expect(secondResponse.status()).toBe(201);
  const second = runSchema.parse(await secondResponse.json());
  expect(second.id).not.toBe(first.id);
  const paused = await page.request.post(`/api/runs/${second.id}/control`, {
    data: { version: second.version, action: "pause" },
  });
  expect(paused.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await expect.poll(selectedWorkspace).toBe(ambient.id);
  await expect(page.getByTestId("task-field-worker")).toContainText(
    worker.name,
  );
  await expect(page.getByTestId("task-field-worker")).toBeDisabled();
  await expect(page.getByTestId("run-status")).toHaveText(m.run.status.paused);
  await expect(page.getByTestId("run-resume")).toBeEnabled();
  await expect(page.getByTestId("run-start")).toHaveCount(0);
  await expect(page.getByTestId("run-pause")).toHaveCount(0);
});
