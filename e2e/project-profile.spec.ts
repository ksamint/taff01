import { expect, test } from "@playwright/test";
import {
  memberListSchema,
  meSchema,
  projectSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";
import { openProjectFilters } from "./support/task-fields";

// ADR 0021: an admin sets a project's stage and person in charge; the
// project header shows both in the reader's language.
test.use({ actionTimeout: 15000 });

test("an admin sets and changes a project's stage and person in charge", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post("/api/workspaces", {
    data: { name: `Stages ${locale} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = workspaceSchema.parse(await created.json());
  const self = memberListSchema
    .parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    )
    .find((member) => member.userId === me.user.id);
  if (!self) throw new Error("The admin is not a member");
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();

  await page.goto("/projects");
  await openProjectFilters(page);
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill(`Retainer ${Date.now()}`);
  await page.getByTestId("project-stage-select").selectOption("lead");
  await page.getByTestId("project-lead-select").selectOption(self.id);
  const createdProject = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/projects",
  );
  await page.getByTestId("project-submit").click();
  const project = projectSchema.parse(await (await createdProject).json());
  expect(project).toMatchObject({ stage: "lead", leadId: self.id });
  await expect(page).toHaveURL(`/projects/${project.id}`);
  await expect(page.getByTestId("project-stage")).toContainText(
    m.projects.stages.lead,
  );
  await expect(page.getByTestId("project-lead")).toHaveText(
    m.projects.leadIs.replace("{{name}}", self.name),
  );

  await openProjectFilters(page);
  await page.getByTestId("manage-project").click();
  await expect(page.getByTestId("project-stage-select")).toHaveValue("lead");
  await expect(page.getByTestId("project-lead-select")).toHaveValue(self.id);
  await page.getByTestId("project-stage-select").selectOption("in_service");
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/projects/${project.id}`,
  );
  await page.getByTestId("project-submit").click();
  expect(projectSchema.parse(await (await updated).json())).toMatchObject({
    stage: "in_service",
    leadId: self.id,
    version: project.version + 1,
  });
  await expect(page.getByTestId("project-stage")).toHaveAttribute(
    "data-stage",
    "in_service",
  );
  await expect(page.getByTestId("project-stage")).toContainText(
    m.projects.stages.in_service,
  );
});
