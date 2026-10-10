import { expect, type Page, test } from "@playwright/test";
import type { Me, Task } from "@taff/schemas";
import { freshAccount, messages } from "./support/account";
import { selectLocale, signOutFromMe } from "./support/preferences";

const labels = {
  en: {
    today: "Today",
    agent: "Agent",
    failure: "You don’t have permission to do that.",
    signout: "Sign out",
  },
  "zh-CN": {
    today: "今天",
    agent: "智能体",
    failure: "你没有执行此操作的权限。",
    signout: "退出登录",
  },
  "zh-HK": {
    today: "今天",
    agent: "智能體",
    failure: "你沒有執行此操作的權限。",
    signout: "登出",
  },
};
type TestLocale = keyof typeof labels;

async function signIn(page: Page) {
  const password = process.env.DEMO_PASSWORD;
  if (!password)
    throw new Error(
      "DEMO_PASSWORD must be set to the seeded password before running e2e.",
    );
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
}

async function useLocale(page: Page, locale: TestLocale) {
  await selectLocale(page, locale);
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
}

test("sign in, create a task and assign it to an agent", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const taskNavigations: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/tasks/"))
      taskNavigations.push(request.url());
  });
  await signIn(page);
  await useLocale(page, locale);
  const title = `Agent task ${locale} ${Date.now()}`;
  await page.getByTestId("task-title").fill("   ");
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  await page.getByTestId("task-submit").click();
  await expect(
    page
      .locator("form")
      .filter({ has: page.getByTestId("task-title") })
      .getByRole("alert"),
  ).toHaveText(messages[locale].errors.invalid_input);
  await page.getByTestId("task-title").fill(`  ${title}  `);
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  const agentOption = page
    .getByTestId("task-worker")
    .locator("option")
    .filter({ hasText: labels[locale].agent })
    .first();
  const agentId = await agentOption.getAttribute("value");
  expect(agentId).toBeTruthy();
  await expect(
    page
      .getByTestId("task-owner")
      .locator("option")
      .filter({ hasText: labels[locale].agent }),
  ).toHaveCount(0);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tasks" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("task-submit").click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().title).toBe(title);
  const card = page
    .getByTestId("task-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("assignment-select")).toBeEnabled();
  await card.getByTestId("assignment-select").selectOption(agentId as string);
  await expect(card.getByTestId("assignment-select")).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
  await expect(card.getByTestId("assignment-select")).toHaveValue(
    agentId as string,
  );
  await page.screenshot({ path: `/tmp/taff01-${locale}.png`, fullPage: true });
  const otherLocale: TestLocale = locale === "en" ? "zh-HK" : "en";
  await useLocale(page, otherLocale);
  await expect(
    card
      .getByTestId("assignment-select")
      .locator("option")
      .filter({ hasText: labels[otherLocale].agent }),
  ).not.toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[otherLocale].today,
  );
  await page.waitForLoadState("networkidle");
  expect(taskNavigations).toEqual([]);
  await card.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
  await expect(page.getByTestId("detail-worker")).toHaveValue(
    agentId as string,
  );
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[otherLocale].today,
  );
  await signOutFromMe(page, otherLocale);
  await expect(page.getByTestId("auth-submit")).toBeVisible();
});

test("create an account with a workspace, then sign in again", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const email = `e2e-${locale}-${Date.now()}@example.test`;
  const password = "Taff-e2e-only-2026!";
  await page.goto("/");
  await expect(page.getByTestId("locale-select")).toBeEnabled();
  await page.getByTestId("locale-select").selectOption(locale);
  await page.getByTestId("auth-toggle").click();
  await page.locator("#auth-name").fill("New teammate");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await useLocale(page, locale);
  await page.getByTestId("task-title").fill(`First task ${locale}`);
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  await page.getByTestId("task-submit").click();
  await expect(
    page.getByRole("heading", { name: `First task ${locale}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  await signOutFromMe(page, locale);
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
  await expect(
    page.getByRole("heading", { name: `First task ${locale}`, exact: true }),
  ).toBeVisible();
});

test("failed optimistic creation and assignment restore the previous list", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const ownerId = "22222222-2222-4222-8222-222222222222";
  const agentId = "33333333-3333-4333-8333-333333333333";
  const me: Me = {
    user: {
      id: "user",
      name: "Alex",
      email: "alex@example.test",
      locale,
      tz: "Asia/Singapore",
    },
    workspaces: [
      {
        id: workspaceId,
        name: "Test workspace",
        memberId: ownerId,
        role: "admin",
      },
    ],
  };
  const task: Task = {
    id: "44444444-4444-4444-8444-444444444444",
    workspaceId,
    title: "Existing task",
    description: "",
    priority: 3,
    projectId: null,
    labels: [],
    parentId: null,
    version: 1,
    ownerId,
    workerId: null,
    status: "todo",
    dueAt: null,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
  };
  await page.route("**/api/workspaces/*/access", (route) =>
    route.fulfill({
      json: {
        canCreateTasks: true,
        canManageProjects: true,
        canInvite: true,
        canManageRoles: true,
      },
    }),
  );
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.route("**/api/members?*", (route) =>
    route.fulfill({
      json: [
        {
          id: ownerId,
          workspaceId,
          userId: "user",
          name: "Alex",
          kind: "person",
          role: "admin",
        },
        {
          id: agentId,
          workspaceId,
          userId: null,
          name: "Research assistant",
          kind: "agent",
          role: "member",
        },
      ],
    }),
  );
  await page.route("**/api/tasks?*", (route) =>
    route.fulfill({ json: [task] }),
  );
  let rejectCreate: () => void = () => {};
  const createGate = new Promise<void>((resolve) => {
    rejectCreate = resolve;
  });
  await page.route("**/api/tasks", async (route) => {
    await createGate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  let rejectAssignment: () => void = () => {};
  const assignmentGate = new Promise<void>((resolve) => {
    rejectAssignment = resolve;
  });
  await page.route("**/api/tasks/*/assignment", async (route) => {
    await assignmentGate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
  await page.getByTestId("task-title").fill("Rejected task");
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  await page.getByTestId("task-submit").click();
  await expect(
    page.getByRole("heading", { name: "Rejected task", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Rejected task", exact: true }),
  ).toHaveCount(0);
  rejectCreate();
  await expect(
    page.getByRole("heading", { name: "Rejected task", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: labels[locale].failure }),
  ).toHaveText(labels[locale].failure);
  const assignment = page
    .getByTestId("task-card")
    .filter({ hasText: "Existing task" })
    .getByTestId("assignment-select");
  await expect(assignment).toBeEnabled();
  await assignment.selectOption(agentId);
  await expect(assignment).toHaveValue(agentId);
  rejectAssignment();
  await expect(assignment).toHaveValue("");
  await expect(assignment).toBeEnabled();
  await expect(
    page.getByRole("alert").filter({ hasText: labels[locale].failure }),
  ).toHaveText(labels[locale].failure);
  await expect(page.getByTestId("task-card")).toHaveCount(1);
});
