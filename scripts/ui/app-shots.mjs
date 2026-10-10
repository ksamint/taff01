// Captures every app route signed in as the demo user, for comparison with
// the prototype captures. Usage: node --env-file=.env scripts/ui/app-shots.mjs <out-dir>
// Needs the dev or production server on AUTH_URL.
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("usage: app-shots.mjs <out-dir>");
const base = process.env.AUTH_URL ?? "http://localhost:3000";
const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("DEMO_PASSWORD is required");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 800 }],
]) {
  for (const locale of ["zh-HK", "zh-CN", "en"]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      locale: locale === "en" ? "en-US" : locale,
    });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${device}-${locale}-signin.png` });
    await page.getByTestId("auth-email").fill(email);
    await page.getByTestId("auth-password").fill(password);
    await page.getByTestId("auth-submit").click();
    await page.getByTestId("today-heading").waitFor({ timeout: 30000 });
    const me = await (await page.request.get(`${base}/api/me`)).json();
    if (me.user.locale !== locale) {
      await page.request.patch(`${base}/api/profile`, {
        data: { locale, tz: me.user.tz },
        headers: { Origin: base },
      });
      await page.reload({ waitUntil: "networkidle" });
    }
    const workspace = me.workspaces[0].id;
    const tasks = await (
      await page.request.get(`${base}/api/tasks?workspaceId=${workspace}`)
    ).json();
    const members = await (
      await page.request.get(`${base}/api/members?workspaceId=${workspace}`)
    ).json();
    const agent = members.find((member) => member.kind === "agent");
    const routes = [
      "/",
      "/calendar",
      "/projects",
      "/inbox",
      "/me",
      "/me/mcp",
      "/orgs",
      tasks[0] ? `/tasks/${tasks[0].id}` : null,
      agent ? `/agents/${agent.id}` : null,
    ].filter(Boolean);
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const name =
        route === "/"
          ? "today"
          : route
              .replace(/^\//, "")
              .replace(/\/[0-9a-f-]{36}/, "")
              .replace(/\//g, "-");
      await page.screenshot({ path: `${out}/${device}-${locale}-${name}.png` });
    }
    await context.close();
  }
}
await browser.close();
