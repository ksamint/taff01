// Self-served, offline reference captures. No app, account, or API is involved.
// Usage: pnpm ui:prototype-shots [--dark | --extra] [output-directory]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const root = await realpath(path.join(repo, "docs/ui/prototype"));
const args = process.argv.slice(2);
assert(
  args.every(
    (arg) => !arg.startsWith("--") || ["--dark", "--extra"].includes(arg),
  ),
);
const dark = args.includes("--dark");
const extra = args.includes("--extra");
assert(!(dark && extra), "Choose one capture mode");
const destinations = args.filter((arg) => !["--dark", "--extra"].includes(arg));
assert(destinations.length <= 1, "Provide at most one output directory");
const approvedLight = path.join(repo, "docs/ui/reference");
const out = path.resolve(
  destinations[0] ||
    (extra
      ? path.join(approvedLight, "extra")
      : dark
        ? path.join(approvedLight, "dark")
        : approvedLight),
);
assert(
  !extra || (out !== approvedLight && out !== path.join(approvedLight, "dark")),
  "Extra captures must not replace approved light or dark references",
);
assert(
  !dark || out !== approvedLight,
  "Dark captures must not replace approved light references",
);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    const file = await realpath(
      path.resolve(root, `.${decodeURIComponent(url.pathname)}`),
    );
    if (!file.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const labels = {
  zh: {
    today: "今天",
    calendar: "日曆",
    projects: "項目",
    inbox: "收件箱",
    me: "我的",
    schedule: "日程",
    project: "結賬改版",
    board: "看板",
    list: "列表",
    team: "團隊",
    mcp: "設定 › MCP",
    organization: "組織",
    switchOrganization: "切換組織",
    agent: "調研智能體",
    permissions: "權限",
    search: "搜寻",
    task: "撰寫 v2.4 發佈說明",
    review: "競品結賬流程調研",
    reviewHeading: "審核交付物",
    checklist: "審核清單",
    allRead: "全部已讀",
    northwind: "北風科技",
    week: "周",
    month: "月",
    notifications: "通知",
    notificationTypes: "推送通知",
    quickAdd: "快速添加",
  },
  en: {
    today: "Today",
    calendar: "Calendar",
    projects: "Projects",
    inbox: "Inbox",
    me: "Me",
    schedule: "Schedule",
    project: "Checkout v2",
    board: "Board",
    list: "List",
    team: "Team",
    mcp: "Settings › MCP",
    organization: "Organization",
    switchOrganization: "Switch organization",
    agent: "Research Agent",
    permissions: "Permissions",
    search: "Search",
    task: "Draft v2.4 release notes",
    review: "Competitive checkout teardown",
    reviewHeading: "Review the deliverable",
    checklist: "Checklist",
    allRead: "Mark all read",
    northwind: "Northwind",
    week: "Week",
    month: "Month",
    notifications: "Notifications",
    notificationTypes: "Push notifications",
    quickAdd: "Quick add",
  },
};
const phoneScreens = [
  "today",
  "calendar",
  "projects",
  "inbox",
  "me",
  "task-detail",
  "review",
  "agent-profile",
  "mcp",
  "search",
  "organizations",
];
const desktopScreens = [
  "board",
  "projects",
  "list",
  "inbox",
  "task-detail",
  "review",
  "search",
  "organizations",
];
const extraScreens = [
  "calendar-week",
  "calendar-month",
  "projects-list",
  "notifications",
  "team",
  "quick-add",
];
const records = [];
const externalRequests = [];
const resources = new Set();
let browser;
await mkdir(out, { recursive: true });
await rm(path.join(out, "manifest.json"), { force: true });
// Failures must never leave a previous manifest pretending this run succeeded.
await writeFile(
  path.join(out, "capture-status.json"),
  JSON.stringify({ status: "running" }, null, 2) + "\n",
);
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
  for (const device of extra ? ["phone"] : ["phone", "desktop"]) {
    const viewport =
      device === "phone"
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 };
    for (const lang of ["zh", "en"]) {
      const l = labels[lang];
      const screens = extra
        ? extraScreens
        : dark
          ? device === "phone"
            ? ["projects"]
            : ["board", "list"]
          : device === "phone"
            ? phoneScreens
            : desktopScreens;
      for (const screen of screens) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("requestfailed", (request) =>
          errors.push(`${request.url()}: ${request.failure()?.errorText}`),
        );
        page.on("response", (response) => {
          const u = new URL(response.url());
          resources.add(u.pathname);
          if (response.status() >= 400)
            errors.push(`${u.pathname}: HTTP ${response.status()}`);
        });
        await context.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.origin === origin) return route.continue();
          externalRequests.push(url.href);
          return route.abort("blockedbyclient");
        });
        const time = new Date("2026-10-08T03:20:00Z");
        await page.clock.install({ time });
        await page.clock.pauseAt(time);
        // Freeze simulation/progress/toast timers even if the initial render
        // schedules them before an editor prop update has committed. Preserve
        // short focus, scrolling, persistence and UI transition timers.
        await page.addInitScript(() => {
          const schedule = window.setTimeout.bind(window);
          window.setTimeout = (handler, delay = 0, ...args) =>
            schedule(handler, delay >= 1000 ? 2147483647 : delay, ...args);
        });
        await page.goto(`${origin}/team-tasks.dc.html?reset`, {
          waitUntil: "networkidle",
        });
        await expect(
          page.locator('[data-reference-surface="phone"]'),
        ).toBeAttached();
        // Public prototype editor API: retain the supported slow simulation speed.
        // Clock remains paused except bounded UI transition/focus ticks below.
        await page.evaluate(() =>
          window.__dcSetProps(window.__dcRootName(), { agentSpeed: 20 }),
        );
        await page.clock.runFor(400);
        const phone = page.locator('[data-reference-surface="phone"]');
        const click = async (locator) => {
          await locator.click({ timeout: 5000 });
          await page.clock.runFor(450);
        };
        const tab = async (key) =>
          click(
            phone
              .getByRole("button", { name: labels.zh[key], exact: true })
              .last(),
          );
        // Exercise the actual language control, rather than assume ?lang works.
        if (lang === "en") {
          await tab("me");
          await click(
            phone.getByRole("button", { name: "English", exact: true }),
          );
          await click(
            phone.getByRole("button", { name: "Today", exact: true }).last(),
          );
        }
        await expect(page.locator("[data-reference-canvas]")).toHaveAttribute(
          "lang",
          lang === "zh" ? "zh-Hant-HK" : "en",
        );
        if (dark) {
          await click(
            phone.getByRole("button", { name: l.me, exact: true }).last(),
          );
          await click(
            phone.getByRole("button", {
              name: lang === "zh" ? "深色" : "Dark",
              exact: true,
            }),
          );
          await click(
            phone.getByRole("button", { name: l.today, exact: true }).last(),
          );
        }
        // Assert the rendered source surface, not OS color-scheme emulation.
        const renderedTheme = await phone.evaluate(
          (surface) => getComputedStyle(surface).backgroundColor,
        );
        assert.equal(
          renderedTheme,
          dark ? "rgb(10, 22, 38)" : "rgb(255, 255, 255)",
        );
        // Only normalize surrounding design-canvas placement: preserve native
        // screen dimensions, OS chrome, rounded corners, content and controls.
        await page.addStyleTag({
          content: `[data-reference-canvas]{padding:0!important;gap:0!important;min-width:0!important;min-height:0!important;width:auto!important;display:block!important}[data-reference-preview="${device === "phone" ? "desktop" : "phone"}"]{display:none!important}[data-reference-preview="${device}"]{gap:0!important;width:${viewport.width}px!important}[data-reference-preview="${device}"]>div:first-child{display:none!important}[data-reference-preview="phone"]>div:nth-child(2){padding:0!important;background:transparent!important;width:390px!important}[data-reference-preview="phone"]>div:nth-child(n+3){display:none!important}`,
        });
        const surface = page.locator(`[data-reference-surface="${device}"]`);
        assert.equal(
          await surface.evaluate(
            (node) => getComputedStyle(node).backgroundColor,
          ),
          renderedTheme,
        );
        if (device === "phone") {
          const select = async (key) =>
            click(
              phone
                .getByRole("button", {
                  name: new RegExp(`(?:^|\\s)${l[key]}$`),
                })
                .last(),
            );
          if (phoneScreens.slice(0, 5).includes(screen)) await select(screen);
          if (["calendar-week", "calendar-month"].includes(screen)) {
            await select("calendar");
            await click(
              phone.getByRole("button", {
                name: screen === "calendar-week" ? l.week : l.month,
                exact: true,
              }),
            );
          }
          if (screen === "projects-list") {
            await select("projects");
            await click(phone.getByRole("tab", { name: l.list, exact: true }));
          }
          if (["notifications", "team"].includes(screen)) {
            await select("me");
            await click(
              phone
                .getByRole("button", {
                  name: new RegExp(
                    screen === "team" ? l.team : l.notifications,
                  ),
                })
                .first(),
            );
          }
          if (screen === "quick-add")
            await click(
              phone.getByRole("button", { name: l.quickAdd, exact: true }),
            );
          if (screen === "task-detail") {
            await select("projects");
            await click(phone.getByText(l.task, { exact: true }).first());
          }
          if (screen === "review") {
            await select("inbox");
            await click(phone.getByText(l.review, { exact: true }).first());
          }
          if (["agent-profile", "mcp", "organizations"].includes(screen)) {
            await select("me");
            if (screen === "agent-profile") {
              await click(
                phone.getByRole("button", { name: new RegExp(l.team) }).first(),
              );
              await click(
                phone
                  .getByRole("button", { name: new RegExp(l.agent) })
                  .first(),
              );
            }
            if (screen === "mcp")
              await click(
                phone.getByRole("button", { name: new RegExp("MCP") }).first(),
              );
            if (screen === "organizations")
              await click(
                phone
                  .getByRole("button", { name: new RegExp(l.organization) })
                  .first(),
              );
          }
          if (screen === "search")
            await click(
              phone
                .getByRole("button", { name: l.search, exact: true })
                .first(),
            );
        } else {
          if (screen === "inbox")
            await click(surface.getByText(l.inbox, { exact: true }).first());
          if (screen === "list")
            await click(
              surface.getByRole("button", { name: l.list, exact: true }),
            );
          if (screen === "task-detail")
            await click(surface.getByText(l.task, { exact: true }));
          if (screen === "review") {
            await click(surface.getByText(l.inbox, { exact: true }).first());
            await click(surface.getByText(l.review, { exact: true }).first());
          }
          if (screen === "search") {
            await page.keyboard.press("Control+k");
            await page.clock.runFor(450);
          }
          if (screen === "organizations")
            await click(
              surface.getByText(l.northwind, { exact: true }).first(),
            );
        }
        const expected = {
          today: l.schedule,
          calendar: lang === "zh" ? "拖動改期" : "Drag to reschedule",
          projects: l.project,
          board: l.project,
          list: l.task,
          inbox:
            device === "phone"
              ? l.allRead
              : lang === "zh"
                ? "請求審核"
                : "requested review",
          me: l.mcp,
          "task-detail": l.task,
          review: l.reviewHeading,
          "agent-profile": l.permissions,
          mcp: lang === "zh" ? "MCP 端點" : "MCP endpoint",
          search: lang === "zh" ? "最近" : "Recent",
          organizations: l.switchOrganization,
          "calendar-week": lang === "zh" ? "拖動改期" : "Drag to reschedule",
          "calendar-month": lang === "zh" ? "2026年10月" : "October 2026",
          "projects-list": l.task,
          notifications: l.notificationTypes,
          team: l.agent,
          "quick-add": l.quickAdd,
        }[screen];
        const view =
          screen === "quick-add"
            ? phone.getByRole("dialog")
            : screen === "notifications"
              ? phone
                  .getByText(l.notifications, { exact: true })
                  .last()
                  .locator("..")
                  .locator("..")
              : surface.locator(
                  `[data-reference-view="${screen === "review" ? "task-detail" : ["calendar-week", "calendar-month"].includes(screen) ? "calendar" : screen === "projects-list" ? "projects" : screen === "projects" && device === "desktop" ? "board" : screen}"]`,
                );
        await expect(view).toBeVisible();
        await expect(surface).toContainText(expected, { timeout: 5000 });
        await expect(view).toContainText(expected);
        if (screen === "calendar-month")
          assert(
            (await view.locator("[data-day]").count()) >= 35,
            "Month cells absent",
          );
        if (screen === "calendar-week")
          await expect(
            view.getByRole("button", { name: l.week, exact: true }),
          ).toHaveCSS("font-weight", "600");
        if (screen === "projects-list")
          await expect(
            view.getByRole("tab", { name: l.list, exact: true }),
          ).toHaveAttribute("aria-selected", "true");
        if (screen === "notifications")
          assert(
            (await view.getByRole("switch").count()) >= 6,
            "Notification controls absent",
          );
        if (screen === "quick-add")
          await expect(view.locator("textarea")).toBeVisible();
        if (screen === "review")
          await expect(surface).toContainText(l.checklist);
        if (screen === "organizations" && device === "phone")
          await expect(phone.getByRole("dialog")).toBeVisible();
        if (screen === "search")
          await expect(
            surface.locator("input").filter({ visible: true }).first(),
          ).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.load('500 15px "Noto Sans TC"', "北風科技");
          await document.fonts.load('500 15px "Manrope"', "Northwind");
          await document.fonts.ready;
        });
        const fonts = await page.evaluate(() =>
          [...document.fonts].map((f) => ({
            family: f.family,
            status: f.status,
          })),
        );
        assert(
          fonts.some(
            (f) => f.family === "Noto Sans TC" && f.status === "loaded",
          ),
          "Noto font not loaded",
        );
        assert(
          fonts.some((f) => f.family === "Manrope" && f.status === "loaded"),
          "Manrope font not loaded",
        );
        const seedTasks = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("teamtasks.demo.v2")).tasks.map(
            ({ id, status, agentState, progress }) => ({
              id,
              status,
              agentState,
              progress,
            }),
          ),
        );
        assert.deepEqual(
          seedTasks.find((t) => t.id === "NW-138"),
          { id: "NW-138", status: "doing", agentState: "working", progress: 2 },
        );
        for (const id of ["NW-141", "NW-142"])
          assert.equal(seedTasks.find((t) => t.id === id)?.status, "review");
        assert.equal(
          seedTasks.find((t) => t.id === "NW-144")?.agentState,
          "blocked",
        );
        const bounds = await surface.boundingBox();
        assert(
          bounds &&
            bounds.width === viewport.width &&
            bounds.height === viewport.height,
          `Wrong surface size: ${JSON.stringify(bounds)}`,
        );
        assert.equal(
          externalRequests.length,
          0,
          `External requests: ${externalRequests.join(", ")}`,
        );
        assert.deepEqual(
          errors,
          [],
          `Browser errors on ${device}/${lang}/${screen}`,
        );
        const file = `${device}-${lang}-${screen}.png`;
        const bytes = await surface.screenshot({
          path: path.join(out, file),
          animations: "disabled",
        });
        assert.equal(bytes.readUInt32BE(16), viewport.width);
        assert.equal(bytes.readUInt32BE(20), viewport.height);
        assert.deepEqual(errors, [], "Late browser errors during screenshot");
        records.push({
          file,
          device,
          language: lang,
          screen,
          theme: dark ? "dark" : "light",
          backgroundColor: renderedTheme,
          viewport,
          width: viewport.width,
          height: viewport.height,
          sha256: hash(bytes),
          seedTasks,
          assertedText: expected,
          fonts,
          simulatedElapsedMs: await page.evaluate(
            () => Date.now() - Date.parse("2026-10-08T03:20:00Z"),
          ),
        });
        console.log(`Captured ${file} ${viewport.width}x${viewport.height}`);
        await context.close();
      }
    }
  }
  const assets = [];
  async function collect(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, item.name);
      if (item.isDirectory()) await collect(p);
      else {
        const b = await readFile(p);
        assets.push({
          file: path.relative(repo, p),
          bytes: b.length,
          sha256: hash(b),
        });
      }
    }
  }
  await collect(root);
  const scriptPath = path.join(repo, "scripts/ui/prototype-shots.mjs");
  const scriptBytes = await readFile(scriptPath);
  assets.push({
    file: "scripts/ui/prototype-shots.mjs",
    bytes: scriptBytes.length,
    sha256: hash(scriptBytes),
  });
  const manifest = {
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    browser: browser.version(),
    source: "docs/ui/prototype/team-tasks.dc.html",
    theme: dark ? "dark" : "light",
    matrix: extra
      ? "extra-phone-views"
      : dark
        ? "dark-projects"
        : "primary-light-views",
    themeSelection: dark
      ? "Actual Me appearance control before navigating each fresh capture"
      : "Prototype default light appearance",
    capturePolicy:
      "Native screen locator captures; surrounding dual-surface design canvas, labels and outer phone bezel excluded. Product content, synthetic OS status bar/home indicator and rounded screen corners preserved. No scaling.",
    seed: {
      organization: "Northwind",
      date: "2026-10-08",
      time: "11:20 Asia/Hong_Kong",
      state:
        "Initial seed; NW-138 working at 2/4, NW-141 and NW-142 review, NW-144 blocked; no toast; simulation clock paused, agentSpeed=20; timers of at least 1 second frozen while short UI/focus/persistence ticks remain enabled. Actual saved task state is asserted for every capture.",
      freshPagePerCapture: true,
    },
    offline: {
      externalRequests,
      localResources: [...resources].sort(),
      pageErrors: 0,
    },
    unsupportedDesktopViews: {
      today: "No desktop Today view in source",
      calendar: "No desktop Calendar view in source",
      me: "No desktop Me view in source",
      "agent-profile": "Desktop agent links filter the board, no profile pane",
      mcp: "MCP only exists in the phone stack; palette result opens that hidden phone stack",
    },
    captures: records,
    assets,
  };
  await writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(
    path.join(out, "capture-status.json"),
    JSON.stringify(
      {
        status: "complete",
        captures: records.length,
        manifestSha256: hash(await readFile(path.join(out, "manifest.json"))),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Verified ${records.length} native captures; zero external requests and browser errors. Manifest: ${path.join(out, "manifest.json")}`,
  );
} catch (error) {
  await writeFile(
    path.join(out, "capture-status.json"),
    JSON.stringify(
      {
        status: "failed",
        completedCaptures: records.length,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
