// Captures against an isolated running app and its real seeded workspace.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { prototypeId } from "../../packages/schemas/src/prototype-data.ts";
import { prepareFonts } from "./prepare-fonts.ts";

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
        const workspace =
          me.workspaces.find(
            (item) => item.name === "Northwind" || item.name === "北風科技",
          ) ?? me.workspaces.find((item) => item.name === "Taff Demo");
        assert(workspace, "Run pnpm db:seed before capturing");
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
        const agent =
          members.find(
            (member) => member.id === prototypeId("member", "nw", 11),
          ) ?? members.find((member) => member.kind === "agent");
        const task =
          tasks.find((item) => item.id === prototypeId("task", "nw", 145)) ??
          tasks[0];
        const reviewTask =
          tasks.find(
            (item) =>
              item.id === prototypeId("task", "nw", 141) &&
              item.status === "needs_review",
          ) ?? tasks.find((item) => item.status === "needs_review");
        assert(task && agent, "Seed must include tasks and agents");
        const routes = [
          ["today", "/"],
          ["calendar", "/calendar"],
          ["projects", "/projects"],
          ["inbox", "/inbox"],
          ["me", "/me"],
          ["mcp", "/me/mcp"],
          ["organizations", "/orgs"],
          ["task-detail", `/tasks/${task.id}`],
          ["agent", `/agents/${agent.id}`],
          ...(reviewTask ? [["review", `/tasks/${reviewTask.id}`]] : []),
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
          await page.evaluate(prepareFonts);
          await page.screenshot({
            path: path.join(out, `${device}-${locale}-${view}.png`),
            animations: "disabled",
          });
          captures.push({ device, locale, screen: view, route, viewport });
        }
        if (screen === "all" || screen === "search") {
          await page.goto(`${base}/`, { waitUntil: "networkidle" });
          await page.evaluate(prepareFonts);
          await page.keyboard.press("Control+k");
          await expect(page.getByRole("dialog")).toBeVisible();
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
  assert(
    captures.length >= (screen === "all" || screen === "shell" ? 60 : 6),
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
