import { expect, type Page, test } from "@playwright/test";
import { selectLocale } from "./support/preferences";

const labels = {
  en: { today: "Today", mcp: "MCP server", create: "Create token" },
  "zh-CN": { today: "今天", mcp: "MCP 服务器", create: "创建令牌" },
  "zh-HK": { today: "今天", mcp: "MCP 伺服器", create: "建立權杖" },
};
type TestLocale = keyof typeof labels;

async function signIn(page: Page, locale: TestLocale) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD must be set before e2e.");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  // The profile locale wins after sign-in, so choose it once signed in.
  await selectLocale(page, locale);
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
}

test("an admin issues an agent token once and sees it in the list", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  await signIn(page, locale);
  await page.goto("/me");
  await expect(page.getByTestId("open-mcp")).toBeVisible();
  await page.getByTestId("open-mcp").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    labels[locale].mcp,
  );
  await expect(page.getByTestId("mcp-endpoint")).toContainText("/mcp");
  const name = `e2e ${locale} ${Date.now()}`;
  await page.getByTestId("token-name").fill(name);
  await expect(page.getByTestId("token-submit")).toBeEnabled();
  await page.getByTestId("token-submit").click();
  const issued = page.getByTestId("issued-token");
  await expect(issued).toBeVisible();
  await expect(issued.locator("code").first()).toContainText("taff_");
  const card = page
    .getByTestId("token-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("token-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) }),
  ).toBeVisible();
  await expect(page.getByTestId("issued-token")).toHaveCount(0);
});
