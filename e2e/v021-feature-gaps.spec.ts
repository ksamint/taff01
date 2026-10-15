import { expect, type Page, test } from "@playwright/test";
import {
  contactDetailSchema,
  contactListSchema,
  contactSchema,
} from "../packages/schemas/src/crm";
import { projectSchema } from "../packages/schemas/src/index";
import { timelineSchema } from "../packages/schemas/src/plan";
import { freshAccount, messages, type TestLocale } from "./support/account";

async function createProject(page: Page, workspaceId: string) {
  const response = await page.request.post(
    `/api/projects?workspaceId=${workspaceId}`,
    { data: { name: "v021 feature acceptance" } },
  );
  expect(response.status()).toBe(201);
  return projectSchema.parse(await response.json());
}
async function readTimeline(page: Page, projectId: string) {
  const response = await page.request.get(
    `/api/projects/${projectId}/timeline`,
  );
  expect(response.status()).toBe(200);
  return timelineSchema.parse(await response.json());
}
function addDays(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

test("contact page adds project membership and list rows show its roles", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0]!;
  const project = await createProject(page, workspace.id);
  const response = await page.request.post(
    `/api/contacts?workspaceId=${workspace.id}`,
    { data: { name: "Project buyer" } },
  );
  expect(response.status()).toBe(201);
  const contact = contactSchema.parse(await response.json());
  await page.goto(`/contacts/${contact.id}`);
  await page.getByTestId("contact-add-project").selectOption(project.id);
  await page.getByTestId("contact-add-project-submit").click();
  await expect(
    page.locator(`[data-testid="contact-link"][data-id="${project.id}"]`),
  ).toContainText(project.name);
  await expect(
    page
      .getByTestId("contact-add-project")
      .locator(`option[value="${project.id}"]`),
  ).toHaveCount(0);
  const linked = contactDetailSchema.parse(
    await (await page.request.get(`/api/contacts/${contact.id}`)).json(),
  );
  expect(linked.links).toMatchObject([
    { scope: "project", entityId: project.id, roles: [] },
  ]);
  const update = await page.request.put(
    `/api/projects/${project.id}/contacts/${contact.id}`,
    { data: { roles: ["finance", "tech"] } },
  );
  expect(update.status()).toBe(200);
  await page.goto("/contacts");
  await expect(
    page
      .locator(`[data-testid="contact-row"][data-id="${contact.id}"]`)
      .getByTestId("contact-row-roles"),
  ).toHaveText(
    [messages[locale].crm.role.tech, messages[locale].crm.role.finance].join(
      messages[locale].crm.roleSeparator,
    ),
  );
  const listed = contactListSchema.parse(
    await (
      await page.request.get(`/api/contacts?workspaceId=${workspace.id}`)
    ).json(),
  );
  expect(listed.find((entry) => entry.id === contact.id)?.roles).toEqual([
    "tech",
    "finance",
  ]);
  await page.screenshot({ path: info.outputPath("contact-roles.png") });
});

test("milestones create, rename, keyboard nudge, archive and undo without losing history", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const project = await createProject(page, me.workspaces[0]!.id);
  const { today } = await readTimeline(page, project.id);
  await page.goto(`/projects/${project.id}?view=timeline`);
  await page.getByTestId("timeline-new-milestone").click();
  await page.getByTestId("milestone-name").fill("Launch checkpoint");
  await page.getByTestId("milestone-date").fill(today);
  await page.getByTestId("milestone-save").click();
  const row = page.getByTestId("timeline-row");
  await expect(row).toContainText("Launch checkpoint");
  const milestone = (await readTimeline(page, project.id)).items[0]!;
  expect(milestone.kind).toBe("milestone");
  await row.click();
  await page.getByTestId("timeline-rename-milestone").click();
  await page.getByTestId("milestone-name").fill("Renamed checkpoint");
  await page.getByTestId("milestone-save").click();
  await expect(row).toContainText("Renamed checkpoint");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("timeline-rename-milestone")).toBeEnabled();
  await row.focus();
  await row.press("ArrowRight");
  await expect
    .poll(async () => (await readTimeline(page, project.id)).items[0]!.start)
    .toBe(addDays(today, 1));
  await expect(page.getByTestId("timeline-bar")).toHaveAttribute(
    "data-start",
    addDays(today, 1),
  );
  await expect(page.getByTestId("timeline-rename-milestone")).toBeEnabled();
  await row.press("Shift+ArrowLeft");
  await expect
    .poll(async () => (await readTimeline(page, project.id)).items[0]!.start)
    .toBe(addDays(today, -6));
  await expect(page.getByTestId("timeline-bar")).toHaveAttribute(
    "data-start",
    addDays(today, -6),
  );
  await row.click();
  await page.getByTestId("timeline-archive-milestone").click();
  await page.getByTestId("milestone-save").click();
  await expect(row).toHaveCount(0);
  await expect
    .poll(async () => (await readTimeline(page, project.id)).items.length)
    .toBe(0);
  await page.getByTestId("toast-action").click();
  await expect(row).toContainText("Renamed checkpoint");
  await expect
    .poll(async () => (await readTimeline(page, project.id)).items[0]?.id)
    .toBe(milestone.id);
  await page.screenshot({ path: info.outputPath("milestone.png") });
});

test("phone selection scrolls the mind detail panel into view and AI stays off", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0]!;
  const project = await createProject(page, workspace.id);
  const added = await page.request.post(
    `/api/workspaces/${workspace.id}/mind/nodes`,
    { data: { title: "Phone selection", layer: 0, angle: 0 } },
  );
  expect(added.status()).toBe(201);
  await page.goto(`/projects/${project.id}?view=mind`);
  await page.getByTestId("mind-node").click();
  await expect(page.getByTestId("mind-detail-title")).toHaveText(
    "Phone selection",
  );
  await expect
    .poll(async () =>
      page.getByTestId("mind-detail-title").evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("mind-phone-panel.png") });
  await page.goto("/me");
  await page.getByTestId("me-advanced").click();
  await expect(page.getByTestId("ai-enabled")).not.toBeChecked();
  await expect(page.getByTestId("ai-enabled")).toBeDisabled();
  expect(
    await (await page.request.get(`/api/workspaces/${workspace.id}/ai`)).json(),
  ).toMatchObject({ enabled: false });
});

test("desktop Me lists snoozed items, returns them to inbox and embeds the v2 agent profile", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const workspace = me.workspaces[0]!;
  const agentResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/members`,
    { data: { name: "Snoozed agent", kind: "agent" } },
  );
  expect(agentResponse.status()).toBe(201);
  const agent: { id: string } = await agentResponse.json();
  expect(
    (
      await page.request.patch(`/api/agents/${agent.id}`, {
        data: {
          supervisorId: workspace.memberId,
          reviewPolicy: "always_review",
          maxDurationMs: null,
          maxCostMicros: null,
        },
      })
    ).ok(),
  ).toBe(true);
  const requested = await page.request.post(`/api/agents/${agent.id}/grants`, {
    data: { capability: "files.attach", reason: "Snoozed grant acceptance" },
  });
  expect(requested.status()).toBe(201);
  await page.goto("/me?tab=inbox");
  const item = page
    .getByTestId("inbox-item")
    .filter({ hasText: "Snoozed grant acceptance" });
  await expect(item).toBeVisible();
  await item.getByTestId("inbox-snooze").click();
  await expect(item).toHaveCount(0);
  await page.getByTestId("inbox-tab-snoozed").click();
  await expect(item).toBeVisible();
  await page.reload();
  await page.getByTestId("inbox-tab-snoozed").click();
  await expect(item).toBeVisible();
  await item.getByTestId("inbox-unsnooze").click();
  await expect(item).toHaveCount(0);
  await page.getByTestId("inbox-tab-all").click();
  await expect(item).toBeVisible();
  await page.goto("/me?tab=agents");
  await page
    .locator(".me-agent-card")
    .filter({ hasText: "Snoozed agent" })
    .click();
  const embedded = page.locator(".agent-profile-parity.is-embedded");
  await expect(embedded.getByTestId("agent-profile-heading")).toHaveText(
    "Snoozed agent",
  );
  await expect(embedded.locator(".agent-profile-controls")).toBeVisible();
  await expect(embedded.locator(".agent-profile-overview")).toBeVisible();
  await page.screenshot({ path: info.outputPath("agent-profile.png") });
  await page.goto("/me?tab=settings");
  await expect(page.getByTestId("ai-enabled")).not.toBeChecked();
  await expect(page.getByTestId("ai-enabled")).toBeDisabled();
});
