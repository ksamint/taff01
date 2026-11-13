import { expect, test } from "@playwright/test";
import {
  GENERIC_OPERATION_SECTORS,
  indicatorTaskTitle,
  operationTemplateResultSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";
import { openProjectFilters } from "./support/task-fields";

// Spec OT-3 and OT-1.5: on a phone (Pixel 7 projects), an admin applies the
// six-sector template from Projects and opens an indicator task.
test.use({ actionTimeout: 15000 });

test("admin applies the six-sector operation template and opens its tasks on a phone", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  await page.goto("/projects");
  await openProjectFilters(page);
  const apply = page.getByTestId("apply-operation-template");
  await expect(apply).toHaveText(m.projects.applyOperationTemplate);
  const path = `/api/workspaces/${workspace.id}/operation-templates/generic-operation`;
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === path && r.request().method() === "POST",
  );
  await apply.click();
  const result = operationTemplateResultSchema.parse(
    await (await response).json(),
  );
  expect(result).toMatchObject({ createdProjects: 6, createdTasks: 12 });
  await expect(page.getByTestId("toast")).toContainText(
    m.projects.templateApplied
      .replace("{{projects}}", "6")
      .replace("{{tasks}}", "12"),
  );
  const projects = (
    (await (
      await page.request.get(`/api/projects?workspaceId=${workspace.id}`)
    ).json()) as unknown[]
  ).map((p) => projectSchema.parse(p));
  const [finance] = GENERIC_OPERATION_SECTORS;
  const project = projects.find((p) => p.name === finance.project)!;
  expect(
    GENERIC_OPERATION_SECTORS.every((s) =>
      projects.some((p) => p.name === s.project),
    ),
  ).toBe(true);
  await page.goto(`/projects/${project.id}`);
  const title = indicatorTaskTitle(finance.leading);
  await page.getByRole("link", { name: title, exact: true }).first().click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
});
