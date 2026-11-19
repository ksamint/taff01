import { expect, test } from "@playwright/test";
import { projectSchema, taskSchema } from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test.use({ viewport: { width: 412, height: 915 } });

test("phone puts the description first and folds secondary task fields", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0]!;
  const createdProject = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: "Sheet project" } },
  );
  expect(createdProject.status()).toBe(201);
  const project = projectSchema.parse(await createdProject.json());
  const description = "The first line is ready to read.";
  const startAt = "2026-11-20T09:00:00.000Z";
  const createdTask = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      title: "Brief",
      description,
      ownerId: workspace.memberId,
      projectId: project.id,
      priority: 2,
      labels: ["proposal", "proof"],
      calendar: {
        startAt,
        endAt: "2026-11-20T10:00:00.000Z",
        timeZone: "UTC",
        rrule: null,
      },
    },
  });
  expect(createdTask.status()).toBe(201);
  const task = taskSchema.parse(await createdTask.json());

  await page.goto(`/tasks/${task.id}`);
  const title = page.getByTestId("task-detail-heading");
  const firstLine = page.getByText(description, { exact: true });
  await expect(title).toHaveText(task.title);
  await expect(firstLine).toBeInViewport({ ratio: 1 });
  let preceding = (await title.boundingBox())!.y;
  for (const row of [
    firstLine,
    page.getByTestId("task-field-status"),
    page.getByTestId("task-field-owner"),
    page.getByTestId("task-field-worker"),
    page.getByTestId("task-field-due"),
  ]) {
    const position = (await row.boundingBox())!.y;
    expect(position).toBeGreaterThan(preceding);
    preceding = position;
  }

  const more = page.getByTestId("task-fields-more");
  await expect(more).toContainText(m.taskDetail.moreFields);
  await expect(more).toContainText(m.planning.high);
  await expect(more).toContainText(project.name);
  await expect(more).toContainText("proposal, proof");
  const schedule = page.getByTestId("task-schedule");
  await expect(schedule).toBeHidden();
  await more.click();
  const scheduleDate = schedule.locator("span").last();
  await expect(scheduleDate).not.toHaveText(m.taskDetail.unscheduled);
  await expect(more).toContainText((await scheduleDate.textContent())!);

  for (const [field, control] of [
    ["status", "edit-status"],
    ["owner", "edit-owner"],
    ["worker", "detail-worker"],
    ["due", "edit-date"],
    ["priority", "edit-priority"],
    ["project", "edit-project"],
    ["labels", "edit-labels"],
  ]) {
    await page.getByTestId(`task-field-${field}`).click();
    const editor = page.getByTestId(control);
    await expect(editor).toBeVisible();
    await expect(editor).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
  }

  await schedule.click();
  const start = page.getByTestId("schedule-start");
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(start).toHaveCount(0);

  await page.getByTestId("task-field-labels").click();
  await page.getByTestId("edit-labels").fill("approved");
  await page.keyboard.press("Escape");
  await page.getByTestId("edit-save").click();
  await expect(more).toContainText("approved");
});
