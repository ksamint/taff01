// Captures against an isolated running app and its real seeded workspace.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { tsImport } from "tsx/esm/api";
import { prototypeId } from "../../packages/schemas/src/prototype-data.ts";
import { prepareFonts } from "./prepare-fonts.ts";
import { prepareTime } from "./prepare-time.mjs";

const { inboxSchema } = await tsImport(
  "../../packages/schemas/src/inbox-read.ts",
  import.meta.url,
);

const out = path.resolve(process.argv[2] ?? "docs/ui/screenshots/ui-parity");
const base = process.env.AUTH_URL ?? "http://localhost:3000";
const screen = process.env.UI_SCREEN ?? "all";
assert(
  [
    "all",
    "shell",
    "today",
    "calendar",
    "projects",
    "inbox",
    "me",
    "mcp",
    "notifications",
    "team",
    "quick-add",
    "organizations",
    "task-detail",
    "agent",
    "review",
    "search",
    "type",
  ].includes(screen),
  "Unknown UI_SCREEN",
);
const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
const password = process.env.DEMO_PASSWORD;
assert(
  password,
  "DEMO_PASSWORD is required; run against an isolated seeded database",
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const captures = [];
try {
  for (const [device, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 800 }],
  ]) {
    for (const locale of ["zh-HK", "zh-CN", "en"]) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        locale: locale === "en" ? "en-US" : locale,
        timezoneId: "UTC",
        isMobile: device === "phone",
        hasTouch: device === "phone",
      });
      try {
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date("2026-10-08T11:20:00Z"));
        await page.addInitScript(prepareTime);
        const login = await page.request.post(
          `${base}/api/auth/sign-in/email`,
          {
            data: { email, password },
            headers: { Origin: base },
          },
        );
        assert.equal(login.status(), 200, "Demo sign-in failed");
        const profile = await page.request.get(`${base}/api/me`);
        assert.equal(profile.status(), 200);
        const me = await profile.json();
        const workspace = me.workspaces.find(
          (item) => item.id === prototypeId("workspace", "nw"),
        );
        assert(workspace, "Seed must include the Northwind workspace");
        assert.equal(
          (
            await page.request.patch(`${base}/api/profile`, {
              data: { locale, tz: "UTC" },
              headers: { Origin: base },
            })
          ).status(),
          200,
        );
        await page.addInitScript(
          ({ userId, workspaceId, locale }) => {
            sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
            localStorage.setItem("taff:last-workspace", workspaceId);
            localStorage.setItem("taff-locale", locale);
            localStorage.setItem("taff-theme", "light");
          },
          { userId: me.user.id, workspaceId: workspace.id, locale },
        );
        const tasksResponse = await page.request.get(
          `${base}/api/tasks?workspaceId=${workspace.id}`,
        );
        const membersResponse = await page.request.get(
          `${base}/api/members?workspaceId=${workspace.id}`,
        );
        assert.equal(tasksResponse.status(), 200);
        assert.equal(membersResponse.status(), 200);
        const tasks = await tasksResponse.json();
        const members = await membersResponse.json();
        const agent = members.find(
          (member) =>
            member.id === prototypeId("member", "nw", 11) &&
            member.kind === "agent",
        );
        const task = tasks.find(
          (item) => item.id === prototypeId("task", "nw", 145),
        );
        const reviewTask = tasks.find(
          (item) =>
            item.id === prototypeId("task", "nw", 141) &&
            item.status === "needs_review",
        );
        assert(
          task && agent && reviewTask,
          "Seed must include the canonical task, agent and awaiting-review task",
        );
        const routes = [
          ["today", "/"],
          ["calendar", "/calendar"],
          ["projects", "/projects"],
          ["inbox", "/inbox"],
          ["me", "/me"],
          ["mcp", "/me/mcp"],
          ["organizations", "/me"],
          ["notifications", "/me"],
          ["team", "/me"],
          ["quick-add", "/"],
          ["task-detail", "/projects"],
          ["agent", `/agents/${agent.id}`],
          ["review", device === "desktop" ? "/inbox" : "/projects"],
        ];
        for (const [view, route] of routes) {
          if (
            screen !== "all" &&
            screen !== "shell" &&
            screen !== "type" &&
            view !== screen
          )
            continue;
          if (screen === "type" && view !== "projects") continue;
          const response = await page.goto(`${base}${route}`, {
            waitUntil: "networkidle",
          });
          assert.equal(response.status(), 200, `${view} did not load`);
          await expect(page.locator("main.content")).not.toHaveAttribute(
            "inert",
            "",
          );
          let openedReview = false;
          let originalInbox;
          let reviewItem;
          try {
            if (
              view === "task-detail" ||
              (view === "review" && device === "phone") ||
              (view === "projects" && device === "desktop")
            ) {
              const id = view === "task-detail" ? task.id : reviewTask.id;
              await page
                .locator(`a.task-title-link[href="/tasks/${id}"]`)
                .click();
              await expect(
                page.getByTestId("task-detail-heading"),
              ).toBeVisible();
            }
            if (view === "review" && device === "desktop") {
              const inboxResponse = await page.request.get(
                `${base}/api/inbox?workspaceId=${workspace.id}`,
              );
              assert.equal(inboxResponse.status(), 200);
              originalInbox = inboxSchema.parse(await inboxResponse.json());
              reviewItem = originalInbox.items.find(
                (item) =>
                  item.taskId === reviewTask.id && item.kind === "review",
              );
              assert(
                reviewItem,
                "Seed must include this recipient's review item",
              );
              assert.equal(
                reviewItem.readAt,
                null,
                "Review item must start unread",
              );
              const read = page.waitForResponse(
                (response) =>
                  response.url() === `${base}/api/inbox/${reviewItem.id}` &&
                  response.request().method() === "PATCH",
              );
              openedReview = true;
              await page
                .locator(
                  `a.inbox-source-title[href="/tasks/${reviewTask.id}/review"]`,
                )
                .click();
              assert.equal(
                (await read).status(),
                200,
                "Marking review read failed",
              );
              await expect(
                page.getByTestId("task-detail-heading"),
              ).toBeVisible();
            }
            if (
              view === "review" ||
              (view === "projects" && device === "desktop")
            ) {
              await expect(page.getByTestId("review-artifact")).toHaveCount(1);
              await expect(page.getByTestId("run-details")).toBeVisible();
              for (const key of [
                "matchesDescription",
                "verifiable",
                "withinPermissions",
              ])
                await expect(
                  page.getByTestId(`review-check-${key}`),
                ).toBeVisible();
            }
            if (view === "organizations") {
              await page.getByTestId("me-organization").click();
              await expect(page.getByRole("dialog")).toBeVisible();
              await expect(page.locator(".me-org-choices")).toBeVisible();
            } else if (view === "notifications") {
              await page.getByTestId("open-notifications").click();
              await expect(page).toHaveURL(`${base}/me/notifications`);
              await expect(
                page.getByTestId("notification-review"),
              ).toBeEnabled();
            } else if (view === "team") {
              await page.getByTestId("me-team").click();
              await expect(page).toHaveURL(`${base}/orgs#team`);
              await expect(page.locator("#team")).toBeVisible();
              await expect(
                page.locator(".team-directory-list > li"),
              ).toHaveCount(members.length);
            } else if (view === "quick-add") {
              await expect(page.getByTestId("open-quick")).toBeEnabled();
              await page.getByTestId("open-quick").click();
              await expect(page.getByRole("dialog")).toBeVisible();
              await expect(page.getByTestId("quick-title")).toBeEnabled();
            }
            await page.waitForLoadState("networkidle");
            await page.evaluate(prepareFonts);
            await page.mouse.move(0, 0);
            await page.screenshot({
              path: path.join(out, `${device}-${locale}-${view}.png`),
              animations: "disabled",
            });
            if (view === "review") {
              await page
                .getByTestId("review-artifact")
                .scrollIntoViewIfNeeded();
              await page.mouse.move(0, 0);
              await page.screenshot({
                path: path.join(
                  out,
                  `${device}-${locale}-review-deliverable.png`,
                ),
                animations: "disabled",
              });
              captures.push({
                device,
                locale,
                screen: "review-deliverable",
                viewport,
              });
            }
            const capturedUrl = new URL(page.url());
            captures.push({
              device,
              locale,
              screen: view,
              route: `${capturedUrl.pathname}${capturedUrl.hash}`,
              viewport,
            });
          } finally {
            if (openedReview) {
              const restored = await page.request.patch(
                `${base}/api/inbox/${reviewItem.id}`,
                { headers: { Origin: base }, data: { read: false } },
              );
              assert.equal(
                restored.status(),
                200,
                "Restoring review unread failed",
              );
              const afterResponse = await page.request.get(
                `${base}/api/inbox?workspaceId=${workspace.id}`,
              );
              assert.equal(afterResponse.status(), 200);
              const after = inboxSchema.parse(await afterResponse.json());
              assert.equal(
                after.items.find((item) => item.id === reviewItem.id)?.readAt,
                null,
                "Review item must be unread again",
              );
              assert.equal(
                after.unreadCount,
                originalInbox.unreadCount,
                "Unread count must be restored",
              );
            }
          }
        }
        if (screen === "all" || screen === "search") {
          await page.goto(`${base}/`, { waitUntil: "networkidle" });
          await page.keyboard.press("Control+k");
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.waitForLoadState("networkidle");
          await page.evaluate(prepareFonts);
          await page.mouse.move(0, 0);
          await page.screenshot({
            path: path.join(out, `${device}-${locale}-search.png`),
            animations: "disabled",
          });
          captures.push({ device, locale, screen: "search", viewport });
        }
      } finally {
        await context.close();
      }
    }
  }
  assert.equal(
    captures.length,
    screen === "all"
      ? 90
      : screen === "shell"
        ? 84
        : screen === "review"
          ? 12
          : 6,
    "Incomplete capture matrix",
  );
  await writeFile(
    path.join(out, "manifest.json"),
    `${JSON.stringify({ captures }, null, 2)}\n`,
  );
  console.log(`Captured ${captures.length} seeded app screens in ${out}`);
} finally {
  await browser.close();
}
