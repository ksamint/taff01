// Captures the approved prototype's screens for comparison with the app.
// Usage: node scripts/ui/prototype-shots.mjs <base-url> <out-dir>
// Serve docs/ui/prototype statically first (for example
// `python3 -m http.server 8111 --directory docs/ui/prototype`). The prototype
// loads React from unpkg; when docs/ui/prototype/vendor/ holds the UMD files
// they are served from there instead.
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base, out] = process.argv.slice(2);
if (!base || !out)
  throw new Error("usage: prototype-shots.mjs <base-url> <out-dir>");
const vendor = path.resolve("docs/ui/prototype/vendor");
const tabs = {
  today: ["今天", "Today"],
  calendar: ["日曆", "Calendar"],
  projects: ["項目", "Projects"],
  inbox: ["收件箱", "Inbox"],
  me: ["我的", "Me"],
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 800 }],
]) {
  for (const lang of ["zh", "en"]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.route("https://unpkg.com/**", (route) => {
      const file = route.request().url().includes("react-dom")
        ? "react-dom.production.min.js"
        : "react.production.min.js";
      const local = path.join(vendor, file);
      if (existsSync(local))
        return route.fulfill({
          path: local,
          contentType: "application/javascript",
        });
      return route.continue();
    });
    await page.goto(`${base}/team-tasks.dc.html?lang=${lang}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    for (const [tab, labels] of Object.entries(tabs)) {
      const label = labels[lang === "zh" ? 0 : 1];
      await page
        .getByText(label, { exact: true })
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${out}/${device}-${lang}-${tab}.png` });
    }
    await context.close();
  }
}
await browser.close();
