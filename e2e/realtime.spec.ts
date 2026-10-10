import { expect, type Page, test } from "@playwright/test";
import { memberListSchema, meSchema } from "../packages/schemas/src/index";
import { chooseLocale, selectLocale } from "./support/preferences";
import { openQuickAdd } from "./support/tasks";

const labels = {
  en: { today: "Today", running: "Working", paused: "Paused" },
  "zh-CN": { today: "今天", running: "工作中", paused: "已暂停" },
  "zh-HK": { today: "今天", running: "工作中", paused: "已暫停" },
};
type Locale = keyof typeof labels;
async function trackConnection(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (new URL(String(url)).pathname === "/api/realtime") {
          this.addEventListener("open", () => {
            document.documentElement.dataset.realtime = "open";
          });
          this.addEventListener("close", () => {
            document.documentElement.dataset.realtime = "closed";
          });
          document.addEventListener("e2e-close-socket", () => this.close(), {
            once: true,
          });
        }
      }
    };
  });
}
async function signIn(page: Page, locale: Locale) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
  await expect(page.locator("html")).toHaveAttribute("data-realtime", "open");
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const workspace = me.workspaces[0];
  const members = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${workspace.id}`)
    ).json(),
  );
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("Seed agent is required");
  return { workspace, agent };
}

test("two authenticated browsers converge through real workspace WebSockets within one second", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as Locale;
  await trackConnection(page);
  const { workspace, agent } = await signIn(page, locale);
  const otherContext = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    locale: locale === "en" ? "en-US" : locale,
    viewport: { width: 412, height: 915 },
  });
  const other = await otherContext.newPage();
  try {
    await trackConnection(other);
    await signIn(other, locale);
    const title = `Realtime ${locale} ${Date.now()}`;
    await openQuickAdd(page);
    await page.getByTestId("quick-title").fill(title);
    await page.getByTestId("quick-worker").selectOption(agent.id);
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("quick-create").click();
    const response = await created;
    expect(response.status()).toBe(201);
    const task = await response.json();
    await expect(
      other.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 1000 });
    await Promise.all([
      page.goto(`/tasks/${task.id}`),
      other.goto(`/tasks/${task.id}`),
    ]);
    await expect(other.locator("html")).toHaveAttribute(
      "data-realtime",
      "open",
    );
    const started = page.waitForResponse(
      (result) =>
        result.url().endsWith(`/tasks/${task.id}/runs`) &&
        result.request().method() === "POST",
    );
    await page.getByTestId("run-start").click();
    expect((await started).status()).toBe(201);
    await expect(other.getByTestId("run-status")).toHaveText(
      labels[locale].running,
      { timeout: 1000 },
    );
    const paused = page.waitForResponse(
      (result) =>
        result.url().endsWith("/control") &&
        result.request().method() === "POST",
    );
    await page.getByTestId("run-pause").click();
    expect((await paused).status()).toBe(200);
    await expect(other.getByTestId("run-status")).toHaveText(
      labels[locale].paused,
      { timeout: 1000 },
    );
    // A real disconnect misses the write; reopening must refresh the workspace.
    await other.goto("/");
    await expect(other.locator("html")).toHaveAttribute(
      "data-realtime",
      "open",
    );
    await other.evaluate(() =>
      document.dispatchEvent(new Event("e2e-close-socket")),
    );
    const missed = `Reconnect ${locale} ${Date.now()}`;
    const result = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        ownerId: workspace.memberId,
        workerId: null,
        title: missed,
      },
    });
    expect(result.status()).toBe(201);
    await expect(
      other.getByRole("link", { name: missed, exact: true }),
    ).toBeVisible({ timeout: 1000 });
    // Profile language is a user-targeted event rather than a workspace event.
    await page.goto("/me");
    const switched = locale === "en" ? "zh-HK" : "en";
    const saved = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/profile") &&
        result.request().method() === "PATCH",
    );
    await chooseLocale(page, switched);
    expect((await saved).ok()).toBe(true);
    await expect(other.getByTestId("today-heading")).toHaveText(
      labels[switched].today,
      { timeout: 1000 },
    );
  } finally {
    await otherContext.close();
  }
});
