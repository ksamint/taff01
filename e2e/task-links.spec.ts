import { expect, test } from "@playwright/test";
import { meSchema, taskSchema } from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("adds and removes a duplicate task link from detail", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signedUp = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Task links reader",
      email: `task-links-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signedUp.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: "UTC" } })
    ).status(),
  ).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  async function createTask(title: string) {
    const response = await page.request.post("/api/tasks", {
      data: { workspaceId: workspace.id, ownerId: workspace.memberId, title },
    });
    expect(response.status()).toBe(201);
    return taskSchema.parse(await response.json());
  }
  const source = await createTask("Task to link");
  const target = await createTask("Repeated task");
  const link = {
    id: crypto.randomUUID(),
    fromTaskId: source.id,
    toTaskId: target.id,
    otherTaskId: target.id,
    otherTaskTitle: target.title,
    kind: "duplicate",
  };
  let linked = false;
  await page.route("**/api/task-links**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({
        fromTaskId: source.id,
        toTaskId: target.id,
        kind: "duplicate",
      });
      linked = true;
      return route.fulfill({ status: 201, json: link });
    }
    if (request.method() === "DELETE") {
      expect(url.pathname).toBe(`/api/task-links/${link.id}`);
      linked = false;
      return route.fulfill({ status: 204 });
    }
    expect(url.searchParams.get("taskId")).toBe(source.id);
    return route.fulfill({ json: linked ? [link] : [] });
  });

  await page.goto(`/tasks/${source.id}`, { waitUntil: "domcontentloaded" });
  const links = page.getByRole("region", { name: m.taskLinks.title });
  await expect(links.getByText(m.taskLinks.empty)).toBeVisible();
  await links.getByRole("button", { name: m.taskLinks.add }).click();
  const picker = page.getByRole("dialog", { name: m.taskLinks.add });
  await picker.getByLabel(m.taskLinks.kindLabel).selectOption("duplicate");
  const taskInput = picker.getByLabel(m.taskLinks.task);
  await taskInput.selectOption(target.id);
  await expect(
    taskInput.getByRole("option", { name: /Task to link/ }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: m.taskLinks.add }).click();
  await expect(links.getByRole("link", { name: target.title })).toHaveAttribute(
    "href",
    `/tasks/${target.id}`,
  );
  await expect(links.getByText(m.taskLinks.kind.duplicate)).toBeVisible();
  await links.getByRole("button", { name: /Repeated task/ }).click();
  await expect(links.getByText(m.taskLinks.empty)).toBeVisible();
});
