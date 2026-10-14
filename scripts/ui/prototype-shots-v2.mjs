// Prototype v2 reference captures (`pnpm ui:prototype-shots --v2`).
// Self-served from docs/ui, offline, no app, account or API involved.
// Usage: pnpm ui:prototype-shots --v2 [--only=<substring>] [output-directory]
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, realpath, rm } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const root = await realpath(path.join(repo, "docs/ui"));
const args = process.argv.slice(2).filter((arg) => arg !== "--v2");
const only = args.find((arg) => arg.startsWith("--only="))?.slice(7);
assert(
  args.every((arg) => !arg.startsWith("--") || arg.startsWith("--only=")),
  "Unknown option; v2 accepts --only=<substring> and an output directory",
);
const destinations = args.filter((arg) => !arg.startsWith("--"));
assert(destinations.length <= 1, "Provide at most one output directory");
const out = path.resolve(
  destinations[0] || path.join(repo, "docs/ui/reference-v2"),
);
const entry = "/prototype-v2/Team%20Tasks.dc.html";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
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

// Bilingual label: every locator is chosen by visible text or accessible name.
const L = (zh, en) => ({ zh, en });

// Steps receive a driver `d` bound to one page, frame and language.
const phoneScreens = {
  home: { home: true, expect: L("開始", "Start") },
  today: { expect: L("待你處理", "Needs you") },
  "calendar-day": {
    steps: (d) => d.tab(L("日曆", "Calendar")),
    expect: L("拖動改期", "Drag to reschedule"),
  },
  "calendar-week": {
    steps: async (d) => {
      await d.tab(L("日曆", "Calendar"));
      await d.button(L("周", "Week"));
    },
    expect: L("拖動改期", "Drag to reschedule"),
  },
  "calendar-month": {
    steps: async (d) => {
      await d.tab(L("日曆", "Calendar"));
      await d.button(L("月", "Month"));
    },
    expect: L("2026年10月", "October 2026"),
  },
  "projects-board": {
    steps: (d) => d.tab(L("項目", "Projects")),
    expect: L("結賬改版", "Checkout"),
  },
  "projects-list": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("列表", "List"));
    },
    expect: L("結賬改版", "Checkout"),
  },
  stakeholders: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.more(L("相關方", "Stakeholders"));
    },
    expect: L("黃志明", "Wong Chi-ming"),
  },
  timeline: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("時間線", "Timeline"));
    },
    module: true,
  },
  relations: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.more(L("關係圖", "Relations"));
    },
    module: true,
  },
  mind: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.more(L("心智圖", "Mindscape"));
    },
    module: true,
  },
  companies: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("公司", "Companies"));
    },
    expect: L("北風零售集團", "Northwind Retail Group"),
  },
  contacts: {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("聯繫人", "Contacts"));
    },
    expect: L("黃志明", "Wong Chi-ming"),
  },
  "company-page": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("公司", "Companies"));
      await d.text(L("北風零售集團", "Northwind Retail Group"));
    },
    expect: L("黃志明", "Wong Chi-ming"),
  },
  "contact-page": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("聯繫人", "Contacts"));
      await d.text(L("黃志明", "Wong Chi-ming"));
    },
    expect: L("cm.wong@nwretail.hk", "cm.wong@nwretail.hk"),
  },
  "new-company-sheet": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("公司", "Companies"));
      await d.button(L("新增公司", "New company"));
    },
    expect: L("公司名稱", "Company name"),
  },
  "new-contact-sheet": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.roleTab(L("聯繫人", "Contacts"));
      await d.button(L("新增聯繫人", "New contact"));
    },
    expect: L("職位", "Title"),
  },
  inbox: {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/^收件箱/, /^Inbox/));
    },
    expect: L("全部已讀", "Mark all read"),
  },
  me: {
    steps: (d) => d.tab(L("我的", "Me")),
    expect: L("偏好設定", "Preferences"),
  },
  "task-detail": {
    steps: async (d) => {
      await d.tab(L("項目", "Projects"));
      await d.text(L("結賬改版 v2.4 發佈", "Ship Checkout v2.4"));
    },
    expect: L("子任務", "Subtasks"),
  },
  search: {
    steps: (d) => d.button(L("搜寻", "Search")),
    expect: L("最近搜寻", "Recent"),
  },
  notifications: {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/^通知/, /^Notifications/));
    },
    expect: L("推送通知", "Push notifications"),
  },
  "agent-profile": {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/^調研智能體/, /^Research Agent/));
    },
    expect: L("審核策略", "Review policy"),
  },
  team: {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/^團隊/, /^Team/));
    },
    expect: L("邀請成員", "Invite member"),
  },
  mcp: {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/MCP/, /MCP/));
    },
    expect: L("MCP 端點", "MCP endpoint"),
  },
  "ai-brief": {
    steps: async (d) => {
      await d.tab(L("我的", "Me"));
      await d.button(L(/^AI 簡報/, /^Brief/));
    },
    module: true,
  },
  "quick-add": {
    steps: (d) => d.button(L("快速添加", "Quick add")),
    expect: L("建立任務", "Create task"),
  },
};

const desktopScreens = {
  home: { home: true, expect: L("開始", "Start") },
  today: { expect: L("待你處理", "Needs you") },
  calendar: {
    steps: (d) => d.nav(L("日曆", "Calendar")),
    expect: L("周", "Week"),
  },
  board: {
    steps: (d) => d.nav(L("項目", "Projects")),
    expect: L("看板", "Board"),
  },
  list: {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.button(L("列表", "List"));
    },
    expect: L("結賬改版 v2.4 發佈", "Ship Checkout v2.4"),
  },
  stakeholders: {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.more(L("相關方", "Stakeholders"));
    },
    expect: L("黃志明", "Wong Chi-ming"),
  },
  companies: {
    steps: (d) => d.nav(L("公司", "Companies")),
    expect: L("北風零售集團", "Northwind Retail Group"),
  },
  contacts: {
    steps: (d) => d.nav(L("聯繫人", "Contacts")),
    expect: L("黃志明", "Wong Chi-ming"),
  },
  timeline: {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.button(L("時間線", "Timeline"));
    },
    module: true,
  },
  relations: {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.more(L("關係圖", "Relations"));
    },
    module: true,
  },
  mind: {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.more(L("心智圖", "Mindscape"));
    },
    module: true,
  },
  // The header Brief button is disabled in the source (showBriefBtn: false);
  // the brief is reached through Me › AI 簡報.
  "ai-brief": {
    steps: async (d) => {
      await d.text(L("林曉", "Lin Xiao"));
      await d.roleTab(L(/^AI 簡報/, /^Brief/));
    },
    module: true,
  },
  "me-inbox": {
    steps: (d) => d.text(L("林曉", "Lin Xiao")),
    expect: L("收件箱", "Inbox"),
  },
  "me-agents": {
    steps: async (d) => {
      await d.text(L("林曉", "Lin Xiao"));
      await d.roleTab(L(/^智能體/, /^Agents/));
    },
    expect: L("調研智能體", "Research Agent"),
  },
  "me-settings": {
    steps: async (d) => {
      await d.text(L("林曉", "Lin Xiao"));
      await d.roleTab(L(/^設定/, /^Settings/));
    },
    expect: L("MCP", "MCP"),
  },
  "detail-panel": {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.text(L("結賬改版 v2.4 發佈", "Ship Checkout v2.4"));
    },
    expect: L("子任務", "Subtasks"),
  },
  palette: {
    steps: async (d) => {
      await d.page.keyboard.press("Control+k");
      await d.pause();
    },
    expect: L("最近搜寻", "Recent"),
  },
  "quick-add": {
    steps: async (d) => {
      await d.nav(L("項目", "Projects"));
      await d.button(L("新建任務", "New task"));
    },
    expect: L("建立任務", "Create task"),
  },
  "org-popover": {
    steps: (d) => d.text(L("北風科技", "Northwind")),
    expect: L("切換組織", "Switch organization"),
  },
  "sidebar-folded": {
    steps: (d) => d.button(L("收起側欄", "Collapse sidebar")),
    expect: L("待你處理", "Needs you"),
  },
};

const records = [];
const skipped = [];
const externalRequests = new Set();
let browser;
await mkdir(out, { recursive: true });
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    });
  }
  for (const file of await readdir(out))
    if (file.endsWith(".png") && (!only || file.includes(only)))
      await rm(path.join(out, file));

  for (const lang of ["zh", "en"]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        externalRequests.add(url.href);
        return route.abort("blockedbyclient");
      });
      // Freeze the agent simulation and toast timers (>= 1 s) so every capture
      // shows the seeded state; short UI, focus and persistence ticks still run.
      await context.addInitScript(() => {
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = (handler, delay = 0, ...rest) =>
          schedule(handler, delay >= 1000 ? 2147483647 : delay, ...rest);
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // The canvas renders the H5 screen and the web window side by side;
      // their fixed inline sizes are the only stable hooks.
      const phone = page.locator('div[style*="width: 390px; height: 844px"]');
      const desktop = page.locator(
        'div[style*="width: 1280px; height: 800px"]',
      );
      const frames = { phone, desktop };

      const ready = async () => {
        await phone.waitFor();
        await desktop.waitFor();
        await page.waitForFunction(
          () =>
            !document.querySelector(".sc-placeholder") &&
            document.fonts.status === "loaded",
          null,
          { timeout: 15000 },
        );
      };
      const settle = async (ms = 450) => {
        await ready();
        await page.evaluate(async () => {
          await document.fonts.load('500 15px "Noto Sans TC"', "團隊任務");
          await document.fonts.load('500 15px "Manrope"', "Team Tasks");
          await document.fonts.ready;
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
        });
        await page.waitForTimeout(ms);
      };
      const enterApp = async () => {
        for (const frame of [phone, desktop]) {
          const overlay = frame.locator('[data-screen-label^="Home"]');
          if (await overlay.count())
            await overlay
              .getByRole("button", {
                name: /^(開始|進入工作區|Start|Open workspace)$/,
              })
              .last()
              .click();
          await overlay.waitFor({ state: "detached" });
        }
      };

      // 1. Fresh seed; set language and theme through 我的 › 偏好設定.
      await page.goto(`${origin}${entry}?reset`, { waitUntil: "networkidle" });
      await settle();
      await enterApp();
      const meTab = phone.getByRole("button", { name: /(?:^|\s)我的$/ }).last();
      await meTab.click();
      if (lang === "en")
        await phone
          .getByRole("button", { name: "English", exact: true })
          .click();
      if (theme === "dark")
        await phone
          .getByRole("button", {
            name: lang === "zh" ? "深色" : "Dark",
            exact: true,
          })
          .click();
      await settle();
      const saved = await page.evaluate(() => ({ ...localStorage }));
      const stateKey = Object.keys(saved).find((k) => {
        try {
          const v = JSON.parse(saved[k]);
          return v && "skipHome" in v && "theme" in v;
        } catch {
          return false;
        }
      });
      assert(stateKey, "Saved prototype state not found in localStorage");
      const state = JSON.parse(saved[stateKey]);
      assert.equal(state.lang ?? "zh", lang);
      assert.equal(state.theme ?? "light", theme);
      // Start every capture signed out, so both homes show the landing page.
      saved[stateKey] = JSON.stringify({ ...state, signedIn: false });

      for (const [layout, screens] of [
        ["phone", phoneScreens],
        ["desktop", desktopScreens],
      ]) {
        const frame = frames[layout];
        for (const [screen, spec] of Object.entries(screens)) {
          const file = `${layout}-${screen}-${lang}-${theme}.png`;
          if (only && !file.includes(only)) continue;
          // 2. Restore the snapshot, reload without ?reset, drive the screen.
          await page.evaluate((snap) => {
            localStorage.clear();
            for (const [k, v] of Object.entries(snap))
              localStorage.setItem(k, v);
          }, saved);
          await page.goto(`${origin}${entry}`, { waitUntil: "networkidle" });
          await settle();
          const pick = (label) => label[lang];
          const name = (label) => {
            const v = pick(label);
            return typeof v === "string"
              ? { name: v, exact: true }
              : { name: v };
          };
          const d = {
            page,
            pause: () => settle(350),
            click: async (locator) => {
              await locator.click({ timeout: 5000 });
              await settle(350);
            },
            // Tab bar buttons may carry a badge count before the label.
            tab: (label) =>
              d.click(
                frame
                  .getByRole("button", {
                    name: new RegExp(`(?:^|\\s)${pick(label)}$`),
                  })
                  .last(),
              ),
            button: (label) =>
              d.click(frame.getByRole("button", name(label)).first()),
            roleTab: (label) =>
              d.click(frame.getByRole("tab", name(label)).first()),
            text: (label) =>
              d.click(frame.getByText(pick(label), { exact: true }).first()),
            // Desktop sidebar entries are clickable divs, not buttons.
            nav: (label) => d.text(label),
            more: async (label) => {
              await d.button(L(/^更多/, /^More/));
              await d.button(label);
            },
          };
          try {
            if (!spec.home) await enterApp();
            if (spec.steps) await spec.steps(d);
            await settle(spec.module ? 1500 : 450);
            if (!spec.home)
              assert.equal(
                await frame.locator('[data-screen-label^="Home"]').count(),
                0,
                "Home overlay still open",
              );
            if (spec.expect)
              await frame
                .getByText(pick(spec.expect))
                .first()
                .waitFor({ timeout: 5000 });
          } catch (error) {
            skipped.push({ file, reason: error.message.split("\n")[0] });
            console.warn(`Skipped ${file}: ${error.message.split("\n")[0]}`);
            continue;
          }
          const bytes = await frame.screenshot({
            path: path.join(out, file),
            animations: "disabled",
          });
          records.push({ file, bytes: bytes.length });
          console.log(`Captured ${file}`);
        }
      }
      assert.deepEqual(errors, [], `Page errors (${lang}/${theme})`);
      await context.close();
    }
  }
  assert.equal(
    externalRequests.size,
    0,
    `External requests: ${[...externalRequests].join(", ")}`,
  );
  const total = records.reduce((sum, r) => sum + r.bytes, 0);
  console.log(
    `Captured ${records.length} screens (${(total / 1048576).toFixed(1)} MB) into ${out}; skipped ${skipped.length}.`,
  );
  if (skipped.length) {
    for (const s of skipped) console.log(`  skipped ${s.file}: ${s.reason}`);
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
