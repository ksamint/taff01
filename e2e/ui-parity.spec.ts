import { expect, test } from "@playwright/test";
import {
  memberListSchema,
  meSchema,
  taskListSchema,
} from "../packages/schemas/src/base";
import { inboxSchema } from "../packages/schemas/src/inbox-read";
import {
  prototypeAgents,
  prototypeId,
  prototypeTasks,
} from "../packages/schemas/src/prototype-data";
import { runListSchema } from "../packages/schemas/src/run-read";
import { messages } from "./support/messages";

test("shell uses the real Northwind fixture", async ({ page }, info) => {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  const locale = info.project.name.endsWith("zh-HK") ? "zh-HK" : "en";
  const desktop = info.project.name.startsWith("desktop-");
  const signedIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      email: process.env.DEMO_EMAIL ?? "alex@taff.local",
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signedIn.status()).toBe(200);
  const meResponse = await page.request.get("/api/me");
  expect(meResponse.status()).toBe(200);
  const me = meSchema.parse(await meResponse.json());
  const workspaceId = prototypeId("workspace", "nw");
  const workspace = me.workspaces.find((item) => item.id === workspaceId);
  expect(
    workspace,
    "Run db:seed in the isolated visual database first",
  ).toBeDefined();
  const profile = await page.request.patch("/api/profile", {
    headers: { Origin: process.env.AUTH_URL! },
    data: { locale, tz: "Asia/Shanghai" },
  });
  expect(profile.status()).toBe(200);
  const tasksResponse = await page.request.get(
    `/api/tasks?workspaceId=${workspaceId}`,
  );
  const membersResponse = await page.request.get(
    `/api/members?workspaceId=${workspaceId}`,
  );
  const inboxResponse = await page.request.get(
    `/api/inbox?workspaceId=${workspaceId}`,
  );
  const runsResponse = await page.request.get(
    `/api/runs?workspaceId=${workspaceId}`,
  );
  expect(tasksResponse.status()).toBe(200);
  expect(membersResponse.status()).toBe(200);
  expect(inboxResponse.status()).toBe(200);
  expect(runsResponse.status()).toBe(200);
  const tasks = taskListSchema.parse(await tasksResponse.json());
  const members = memberListSchema.parse(await membersResponse.json());
  const inbox = inboxSchema.parse(await inboxResponse.json());
  const runs = runListSchema.parse(await runsResponse.json());
  for (const fixture of prototypeTasks.filter((item) => item.org === "nw")) {
    expect(
      tasks.find(
        (item) => item.id === prototypeId("task", "nw", fixture.number),
      ),
    ).toMatchObject({
      status: fixture.status,
      projectId: prototypeId("project", "nw"),
    });
  }
  expect(
    members
      .filter((item) => item.kind === "agent")
      .map((item) => item.id)
      .sort(),
  ).toEqual(
    prototypeAgents
      .map((item) => prototypeId("member", "nw", item.number))
      .sort(),
  );
  await page.addInitScript(
    ({ userId, workspaceId }) => {
      sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
      localStorage.setItem("taff:last-workspace", workspaceId);
      localStorage.setItem("taff-theme", "light");
    },
    { userId: me.user.id, workspaceId },
  );
  const loaded = await page.goto(desktop ? "/projects" : "/");
  expect(loaded?.status()).toBe(200);
  await expect(page.locator("main.content")).toBeVisible();
  await expect(page.locator("main.content")).not.toHaveAttribute("inert", "");
  const shell = page.locator(desktop ? "aside.sidebar" : "nav.tabbar");
  await expect(shell).toBeVisible();
  await expect(shell.locator('a[href="/inbox"]')).toContainText(
    messages[locale].nav.inbox,
  );
  if (desktop) {
    await expect(shell.locator(".sidebar-agents a")).toHaveCount(3);
    await expect(shell.locator('a[href="/inbox"] .sidebar-count')).toHaveText(
      String(inbox.unreadCount),
    );
    await expect(
      shell.locator('a[href="/projects"] .sidebar-count'),
    ).toHaveText(
      String(
        new Set(
          tasks.flatMap((task) => (task.projectId ? [task.projectId] : [])),
        ).size,
      ),
    );
    for (const agent of prototypeAgents) {
      const latest = runs
        .filter(
          (run) => run.agentId === prototypeId("member", "nw", agent.number),
        )
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0];
      expect(latest, "Seed agent must have its real run").toBeDefined();
      await expect(
        shell.locator(
          `a[href="/agents/${prototypeId("member", "nw", agent.number)}"] .agent-status-dot`,
        ),
      ).toHaveClass(
        new RegExp(`(?:^|\\s)agent-status-${latest.status}(?:\\s|$)`),
      );
    }
  } else {
    await expect(shell.getByRole("link")).toHaveCount(5);
    await expect(shell.locator('a[href="/inbox"] .nav-badge')).toHaveText(
      String(inbox.unreadCount),
    );
  }
  await page.evaluate(() => document.fonts.ready);
  await expect(shell).toHaveScreenshot(desktop ? "sidebar.png" : "tabbar.png", {
    animations: "disabled",
  });
  if (!desktop) {
    const fab = page.locator(".quick-fab");
    await expect(fab).toBeVisible();
    await expect(fab).toBeEnabled();
    await expect(fab).toHaveScreenshot("fab.png", { animations: "disabled" });
    for (const [route, visible] of [
      ["/", true],
      ["/calendar", true],
      ["/projects", true],
      ["/inbox", false],
      ["/me", false],
    ] as const) {
      if (new URL(page.url()).pathname !== route)
        await page.locator(`a[href="${route}"]:visible`).first().click();
      await expect(page).toHaveURL(route);
      await expect(page.locator("main.content")).toBeVisible();
      await expect(page.locator("main.content")).not.toHaveAttribute(
        "inert",
        "",
      );
      if (visible) {
        await expect(fab).toBeVisible();
        await expect(fab).toBeEnabled();
      } else await expect(fab).toHaveCount(0);
    }
  }
});
