import { expect, test } from "@playwright/test";
import { projectSchema } from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { openProjectFilters } from "./support/task-fields";

test("phone project header fits the board and preserves views and CRM navigation", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const [workspace] = me.workspaces;
  const project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: { name: "Header project", deliveryProgress: 42 },
      })
    ).json(),
  );
  expect(
    (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          projectId: project.id,
          title: "First board card",
        },
      })
    ).status(),
  ).toBe(201);
  const path = `/projects/${project.id}`;
  await page.goto(path);
  const card = page.getByTestId("board-task");
  await expect(card).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  expect((await card.boundingBox())?.y).toBeLessThan(240);
  await expect(page.locator(".projects-title-row .projects-org")).toHaveText(
    workspace.name,
  );
  const viewNav = page.getByRole("navigation", {
    name: m.projects.views,
    exact: true,
  });
  await expect(viewNav.getByRole("button")).toHaveCount(1);
  await expect(viewNav.getByRole("link")).toHaveCount(0);
  await expect(page.getByTestId("project-meta")).toHaveCount(0);
  await expect(page.getByTestId("crm-section-projects")).toHaveCount(0);
  for (const view of [
    "list",
    "timeline",
    "stakeholders",
    "relations",
    "board",
  ]) {
    await viewNav.getByTestId("project-view-more").click();
    await viewNav.getByTestId(`project-view-${view}`).click();
    await expect(page).toHaveURL(
      view === "board" ? path : `${path}?view=${view}`,
    );
  }

  for (const section of ["companies", "contacts"] as const) {
    await openProjectFilters(page);
    await expect(page.getByTestId("project-progress")).toContainText("42%");
    await page.getByTestId(`crm-section-${section}`).click();
    await expect(page).toHaveURL(`/${section}`);
    await page.goto(path);
  }

  await page.goto("/projects");
  await expect(page.getByTestId("crm-section-projects")).toBeVisible();
  await expect(page.getByTestId("crm-section-companies")).toBeVisible();
  await expect(page.getByTestId("crm-section-contacts")).toBeVisible();
  await page.getByTestId("project-view-more").click();
  await expect(page.getByTestId("project-view-sectors")).toHaveAttribute(
    "href",
    "/projects?view=sectors",
  );
});
