import { expect, test } from "@playwright/test";
import {
  meSchema,
  type ProjectPhase,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("edits ordered phase rows across the civil range and keeps task planning visible", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Project planner",
      email: `phases-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signup.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: "UTC" } })
    ).status(),
  ).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    {
      data: { name: "Project phases" },
    },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());
  const first: ProjectPhase = {
    id: crypto.randomUUID(),
    projectId: project.id,
    workspaceId: workspace.id,
    name: "First phase",
    position: 1,
    start: "2199-12-28",
    end: "2199-12-31",
  };
  const second = {
    ...first,
    id: crypto.randomUUID(),
    name: "Second phase",
    position: 2,
    start: "1970-01-01",
    end: "1970-01-01",
  };
  const added = {
    ...first,
    id: crypto.randomUUID(),
    name: "Added phase",
    position: 3,
    start: "2026-11-23",
    end: "2026-11-28",
  };
  const edited = { ...second, name: "Edited phase", end: "1970-01-03" };
  let phases = [second, first];
  await page.route("**/api/project-phases**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({
        projectId: project.id,
        name: added.name,
        start: added.start,
        end: added.end,
      });
      phases = [added, ...phases];
      return route.fulfill({ status: 201, json: added });
    }
    if (request.method() === "PATCH") {
      expect(url.pathname).toBe(`/api/project-phases/${second.id}`);
      expect(request.postDataJSON()).toEqual({
        name: edited.name,
        start: edited.start,
        end: edited.end,
      });
      phases = phases.map((phase) => (phase.id === second.id ? edited : phase));
      return route.fulfill({ json: edited });
    }
    expect(url.searchParams.get("projectId")).toBe(project.id);
    return route.fulfill({ json: phases });
  });

  const url = `/projects/${project.id}?view=timeline`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const rows = page.getByTestId("timeline-phase-row");
  await expect(rows).toContainText([first.name, second.name]);
  await expect(page.getByTestId("timeline-row")).toHaveCount(0);
  const firstBar = page.getByTestId("timeline-phase-bar").nth(0);
  const secondBar = page.getByTestId("timeline-phase-bar").nth(1);
  await expect(firstBar).toHaveAttribute("data-end", first.end);
  const oneDay = Number(await secondBar.getAttribute("width"));
  expect(oneDay).toBeGreaterThan(0);
  expect(Number(await firstBar.getAttribute("width"))).toBe(oneDay * 4);
  expect(await page.locator(".timeline-day-label").count()).toBeLessThan(200);

  await page.getByRole("button", { name: m.timeline.addPhase }).click();
  const add = page.getByRole("dialog", { name: m.timeline.addPhase });
  await add.getByLabel(m.timeline.phaseName).fill(added.name);
  await add.getByLabel(m.timeline.start).fill(added.start);
  await add.getByLabel(m.timeline.phaseEnd).fill(added.end);
  await add.getByRole("button", { name: m.planning.save }).click();
  await expect(rows).toContainText([first.name, second.name, added.name]);

  const edit = page.getByRole("dialog", { name: m.timeline.editPhase });
  await secondBar.dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "touch",
  });
  await expect(edit).toHaveCount(0);
  await secondBar.click();
  await expect(edit.getByLabel(m.timeline.start)).toHaveValue(second.start);
  await edit.getByLabel(m.timeline.phaseName).fill(edited.name);
  await edit.getByLabel(m.timeline.phaseEnd).fill(edited.end);
  await edit.getByRole("button", { name: m.planning.save }).click();
  await expect(rows).toContainText([first.name, edited.name, added.name]);
  await expect(secondBar).toHaveAttribute("width", String(oneDay * 3));

  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      ownerId: workspace.memberId,
      title: "Existing task",
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = taskSchema.parse(await taskResponse.json());
  expect(
    (
      await page.request.patch(`/api/tasks/${task.id}/plan`, {
        data: { startDate: added.start, durationDays: 2 },
      })
    ).status(),
  ).toBe(200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("timeline-risk")).toBeVisible();
  await expect(page.getByTestId("timeline-row")).toContainText(task.title);
  await expect(rows).toContainText([first.name, edited.name, added.name]);

  const archived = await page.request.patch(`/api/projects/${project.id}`, {
    data: { version: project.version, archived: true },
  });
  expect(archived.status()).toBe(200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(rows).toContainText([first.name, edited.name, added.name]);
  await expect(
    page.getByRole("button", { name: m.timeline.addPhase }),
  ).toHaveCount(0);
  await expect(rows.getByRole("button")).toHaveCount(0);
  await secondBar.dispatchEvent("click");
  await expect(edit).toHaveCount(0);
});
