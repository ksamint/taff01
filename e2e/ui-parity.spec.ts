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
import { prepareFonts } from "../scripts/ui/prepare-fonts";
import { prepareTime } from "../scripts/ui/prepare-time.mjs";
import { messages } from "./support/messages";

const screen = process.env.UI_SCREEN ?? "shell";
test(`${screen} uses the real Northwind fixture`, async ({ page }, info) => {
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
    data: { locale, tz: screen === "shell" ? "Asia/Shanghai" : "UTC" },
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
  if (screen !== "shell") {
    await page.clock.setFixedTime(new Date("2026-10-08T11:20:00Z"));
    await page.addInitScript(prepareTime);
  }
  const routes: Record<string, string> = {
    today: "/",
    projects: "/projects",
    inbox: "/inbox",
    calendar: "/calendar",
    me: "/me",
    "task-detail": "/projects",
    review: desktop ? "/inbox" : "/projects",
    type: "/projects",
    search: "/projects",
    agent: `/agents/${prototypeId("member", "nw", 11)}`,
    mcp: "/me/mcp",
    organizations: desktop ? "/projects" : "/me",
    team: "/orgs#team",
    notifications: "/me/notifications",
    "quick-add": "/",
  };
  const loaded = await page.goto(
    screen === "shell" ? (desktop ? "/projects" : "/") : routes[screen],
  );
  expect(loaded?.status()).toBe(200);
  await page.evaluate(prepareFonts);
  await expect(page.locator("main.content")).toBeVisible();
  await expect(page.locator("main.content")).not.toHaveAttribute("inert", "");
  const reviewItem = inbox.items.find(
    (item) => item.taskId === prototypeId("task", "nw", 141),
  );
  if (
    screen === "task-detail" ||
    (screen === "review" && !desktop) ||
    (desktop && (screen === "projects" || screen === "type"))
  ) {
    const id = prototypeId("task", "nw", screen === "task-detail" ? 145 : 141);
    await page.locator(`a.task-title-link[href="/tasks/${id}"]`).click();
    await expect(page.getByTestId("task-detail-heading")).toBeVisible();
  }
  if (screen === "task-detail") {
    await expect(page.getByTestId("task-field-worker")).toBeEnabled();
    await expect(page.getByTestId("task-schedule")).toBeEnabled();
  }
  let openedReview = false;
  try {
    if (screen === "review" && desktop) {
      expect(reviewItem).toBeDefined();
      expect(reviewItem!.readAt).toBeNull();
      const read = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/inbox/${reviewItem!.id}`) &&
          response.request().method() === "PATCH",
      );
      openedReview = true;
      await page
        .locator(
          `a.inbox-source-title[href="/tasks/${reviewItem!.taskId}/review"]`,
        )
        .click();
      expect((await read).status()).toBe(200);
      await expect(page.getByTestId("task-detail-heading")).toBeVisible();
    }
    if (screen === "search") {
      await page.keyboard.press("Control+k");
      await expect(page.getByTestId("search-input")).toBeVisible();
    }
    if (screen === "organizations") {
      if (desktop) await page.locator(".sidebar-workspace > summary").click();
      else {
        await page.getByTestId("me-organization").click();
        await expect(page.getByRole("dialog")).toBeVisible();
      }
    }
    if (screen === "quick-add") {
      await page.locator(".quick-fab").click();
      await expect(page.getByTestId("quick-title")).toBeVisible();
      await expect(page.getByTestId("quick-title")).toBeEnabled();
    }
    if (screen !== "shell") {
      if (
        screen === "review" ||
        (desktop && (screen === "projects" || screen === "type"))
      ) {
        await expect(page.getByTestId("review-artifact")).toHaveCount(1);
        await expect(page.getByTestId("run-details")).toBeVisible();
        for (const key of [
          "matchesDescription",
          "verifiable",
          "withinPermissions",
        ])
          await expect(page.getByTestId(`review-check-${key}`)).toBeVisible();
      }
      if (screen === "agent")
        await expect(page.getByTestId("agent-profile-heading")).toBeVisible();
      if (screen === "mcp")
        await expect(page.getByTestId("mcp-endpoint")).toBeVisible();
      if (screen === "team")
        await expect(page.locator(".team-directory-list li")).toHaveCount(
          members.length,
        );
      if (screen === "notifications")
        await expect(page.getByTestId("notification-review")).toBeEnabled();
      await expect(
        page.getByText(messages[locale].loading, { exact: true }),
      ).toHaveCount(0);
      if (screen === "today") {
        await expect(page.getByTestId("today-schedule")).toHaveCount(5);
        await expect(page.getByTestId("task-card")).toHaveCount(2);
        await expect(page.locator(".today-meeting-block")).toHaveCount(3);
        await expect(page.locator(".today-past")).toHaveCount(1);
      } else if (screen === "projects" || screen === "type") {
        await expect(page.getByTestId("board-task")).toHaveCount(12);
      } else if (screen === "task-detail" || screen === "review") {
        await expect(page.getByTestId("task-detail-heading")).toBeVisible();
      } else if (screen === "calendar") {
        const lanes = page.locator(".calendar-day-lanes .sx__calendar");
        await expect(lanes).toHaveCount(2);
        await expect(lanes.nth(0)).toBeVisible();
        await expect(lanes.nth(1)).toBeVisible();
        await expect(page.locator(".sx__time-grid-event")).toHaveCount(5);
      } else if (screen === "inbox") {
        await expect(page.getByTestId("inbox-item")).toHaveCount(
          inbox.items.length,
        );
        if (desktop)
          await expect(page.getByTestId("task-detail-heading")).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${screen}.png`, {
        animations: "disabled",
      });
      if (screen === "review") {
        await page.getByTestId("review-artifact").scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot("review-deliverable.png", {
          animations: "disabled",
        });
      }
      if (screen === "projects") {
        await page.getByTestId("project-view-list").click();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot("projects-list.png", {
          animations: "disabled",
        });
      }
      if (screen === "calendar") {
        await page.getByTestId("calendar-week").click();
        await expect(page.locator(".calendar-engine-week")).toBeVisible();
        await expect(page.locator(".loading")).toHaveCount(0);
        await expect(
          page.locator(
            `.sx__time-grid-event[data-event-id^="occurrence-${prototypeId("task", "nw", 138)}-"]`,
          ),
        ).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot("calendar-week.png", {
          animations: "disabled",
        });
        await page.getByTestId("calendar-month-grid").click();
        await expect(page.locator(".calendar-engine-month-grid")).toBeVisible();
        await expect(page.locator(".loading")).toHaveCount(0);
        await expect(
          page.locator(
            `.sx__month-grid-event[data-event-id^="occurrence-${prototypeId("task", "nw", 138)}-"]`,
          ),
        ).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot("calendar-month.png", {
          animations: "disabled",
        });
      }
      if (screen === "type") {
        await page.evaluate(() => {
          localStorage.setItem("taff-theme", "dark");
          document.documentElement.dataset.theme = "dark";
        });
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot("type-dark.png", {
          animations: "disabled",
        });
      }
      return;
    }
  } finally {
    if (openedReview) {
      // Opening the real Inbox pane marks this isolated recipient's item read.
      const restored = await page.request.patch(
        `/api/inbox/${reviewItem!.id}`,
        {
          headers: { Origin: process.env.AUTH_URL! },
          data: { read: false },
        },
      );
      expect(restored.status()).toBe(200);
      const after = await page.request.get(
        `/api/inbox?workspaceId=${workspaceId}`,
      );
      expect(after.status()).toBe(200);
      const restoredInbox = inboxSchema.parse(await after.json());
      expect(restoredInbox.unreadCount).toBe(inbox.unreadCount);
      expect(
        restoredInbox.items.find((item) => item.id === reviewItem!.id)?.readAt,
      ).toBeNull();
    }
  }
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
