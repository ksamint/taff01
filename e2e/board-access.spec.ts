import { devices, expect, type Page, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { holdRequest } from "./support/routes";

test.use({ serviceWorkers: "block" });

async function dragCard(page: Page, status: "todo" | "in_progress") {
  await page.setViewportSize({ width: 1500, height: 1000 });
  const handle = page.getByTestId("drag-handle");
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const target = await page.getByTestId(`board-column-${status}`).boundingBox();
  if (!source || !target) throw new Error("Board drag geometry unavailable");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 90);
  await page.mouse.up();
}

test("board reads task access on demand and keeps a non-owner member read-only", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const admin = await freshAccount(page, locale);
  await verifyTestEmail(page, admin.user.id);
  const [workspace] = admin.workspaces;
  const project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: { name: "Board access" },
      })
    ).json(),
  );
  const cardTask = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          ownerId: workspace.memberId,
          title: "Owned by the administrator",
        },
      })
    ).json(),
  );
  const taskPath = `/api/tasks/${cardTask.id}`;
  const accessPath = `${taskPath}/access`;
  const accessReads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() === "GET" &&
      /^\/api\/tasks\/[^/]+\/access$/.test(path)
    )
      accessReads.push(path);
  });

  const boardPath = `/projects/${project.id}`;
  await page.goto(boardPath);
  const card = page.getByTestId("board-task");
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(accessReads).toEqual([]);
  await card.locator("summary").click();
  await expect(card.getByTestId("board-status")).toBeEnabled();
  expect(accessReads).toEqual([accessPath]);

  await card.locator("summary").click();
  const held = await holdRequest(page, accessPath, {
    method: "GET",
    reply: "continue",
  });
  const adminPatches: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH")
      adminPatches.push(new URL(request.url()).pathname);
  });
  const move = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === taskPath,
  );
  try {
    await dragCard(page, "in_progress");
    await held.seen;
    expect(adminPatches).not.toContain(taskPath);
    await expect(page.getByTestId("board-column-todo")).toContainText(
      cardTask.title,
    );
  } finally {
    held.release();
  }
  expect((await move).ok()).toBe(true);
  await expect(page.getByTestId("board-column-in_progress")).toContainText(
    cardTask.title,
  );

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: process.env.AUTH_URL,
    locale: locale === "en" ? "en-US" : locale,
    serviceWorkers: "block",
  });
  try {
    const reader = await context.newPage();
    const member = await freshAccount(reader, locale);
    await verifyTestEmail(reader, member.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email: member.user.email, role: "member" },
        })
      ).json(),
    );
    expect(
      (
        await reader.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    await reader.goto("/orgs");
    await reader.getByTestId(`workspace-${workspace.id}`).click();
    await reader.goto(boardPath);
    const readerCard = reader.getByTestId("board-task");
    const permissionRead = reader.waitForResponse(
      (response) => new URL(response.url()).pathname === accessPath,
    );
    await readerCard.locator("summary").click();
    expect(await (await permissionRead).json()).toMatchObject({
      allowedStatuses: [],
      canEdit: false,
    });
    await expect(readerCard.getByTestId("board-status")).toBeDisabled();
    await readerCard.locator("summary").click();

    const patches: string[] = [];
    reader.on("request", (request) => {
      if (request.method() === "PATCH")
        patches.push(new URL(request.url()).pathname);
    });
    const dragRead = reader.waitForResponse(
      (response) => new URL(response.url()).pathname === accessPath,
    );
    await dragCard(reader, "todo");
    expect(await (await dragRead).json()).toMatchObject({
      allowedStatuses: [],
    });
    await expect(reader.getByTestId("board-column-in_progress")).toContainText(
      cardTask.title,
    );
    await reader.waitForLoadState("networkidle");
    expect(patches).not.toContain(taskPath);

    await reader.goto(`/tasks/${cardTask.id}`);
    await expect(reader.getByTestId("task-field-text")).toBeDisabled();
  } finally {
    await context.close();
  }
});
