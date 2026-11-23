import { expect, test } from "@playwright/test";
import {
  meSchema,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("posts project health without hiding computed risk and loads earlier updates", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signedUp = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Project health reader",
      email: `project-health-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signedUp.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", {
        data: { locale, tz: "UTC" },
      })
    ).status(),
  ).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: "Project health history" } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      projectId: project.id,
      title: "Planned task",
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  expect(
    (
      await page.request.patch(`/api/tasks/${task.id}/plan`, {
        data: {
          startDate: new Date().toISOString().slice(0, 10),
          durationDays: 2,
        },
      })
    ).status(),
  ).toBe(200);

  const initial = {
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    projectId: project.id,
    authorId: workspace.memberId,
    health: "at_risk",
    body: "Waiting for the supplier.",
    createdAt: "2026-11-22T01:00:00.000Z",
  };
  const earlier = {
    ...initial,
    id: crypto.randomUUID(),
    health: "on_track",
    body: "The project started.",
    createdAt: "2026-11-21T01:00:00.000Z",
  };
  const posted = {
    ...initial,
    id: crypto.randomUUID(),
    health: "off_track",
    body: "Delivery will move to next week.",
    createdAt: "2026-11-23T01:00:00.000Z",
  };
  let latest = [initial];
  await page.route("**/api/project-updates**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({
        projectId: project.id,
        health: posted.health,
        body: posted.body,
      });
      latest = [posted, initial];
      return route.fulfill({ status: 201, json: posted });
    }
    const query = new URL(request.url()).searchParams;
    expect(query.get("projectId")).toBe(project.id);
    const before = query.get("before");
    if (before !== null) expect(before).toBe(initial.id);
    return route.fulfill({
      json: before
        ? { updates: [earlier], nextCursor: null }
        : { updates: latest, nextCursor: initial.id },
    });
  });

  await page.goto(`/projects/${project.id}?view=timeline`);
  await expect(page.getByTestId("timeline-risk")).toBeVisible();
  await expect(
    page.getByText(m.projectUpdates.health.at_risk, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: m.projectUpdates.title, exact: true })
    .click();
  const history = page.getByRole("dialog", { name: m.projectUpdates.title });
  await expect(history.getByText(initial.body)).toBeVisible();
  await history.getByRole("button", { name: m.projectUpdates.older }).click();
  await expect(history.getByText(earlier.body)).toBeVisible();

  await history.getByRole("button", { name: m.projectUpdates.post }).click();
  const sheet = page.getByRole("dialog", { name: m.projectUpdates.post });
  await sheet
    .getByLabel(m.projectUpdates.healthLabel)
    .selectOption(posted.health);
  await sheet.getByLabel(m.projectUpdates.notes).fill(posted.body);
  await sheet.getByRole("button", { name: m.projectUpdates.post }).click();
  await expect(history.getByText(posted.body)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(m.projectUpdates.health.off_track, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-risk")).toBeVisible();
});
