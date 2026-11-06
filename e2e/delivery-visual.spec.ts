import { expect, test } from "@playwright/test";
import english from "../backend/crates/taff-render/tests/fixtures/summary-en.json";
import simplified from "../backend/crates/taff-render/tests/fixtures/summary-zh-CN.json";
import traditional from "../backend/crates/taff-render/tests/fixtures/summary-zh-HK.json";
import { setLocalTestSystemAdmin } from "../packages/core/src/testing/system-admin";
import {
  dailySummarySchema,
  issuedAgentTokenSchema,
  memberListSchema,
  meSchema,
  systemAccessMatrixSchema,
} from "../packages/schemas/src/index";
import { prepareFonts } from "../scripts/ui/prepare-fonts";
import { authPost } from "./release/support";
import { orderVisualOrganizations } from "./support/delivery-order";
import { messages, type TestLocale } from "./support/messages";

// Real app pages and real access reads; only the report content is fixed to
// the renderer's reviewed golden, so its dates and watermark cannot drift.
test("summary and access screens", async ({ page }, info) => {
  test.setTimeout(120_000);
  const browserPlatform = await page.evaluate(() => navigator.platform);
  if (!browserPlatform.startsWith("Linux"))
    throw new Error(
      "Capture and compare delivery baselines with local Linux Chromium",
    );
  if (!process.env.DEMO_PASSWORD || !process.env.DATABASE_URL)
    throw new Error("Local visual database and demo password required");
  const locale: TestLocale = info.project.name.endsWith("zh-CN")
    ? "zh-CN"
    : info.project.name.endsWith("zh-HK")
      ? "zh-HK"
      : "en";
  const m = messages[locale];
  const signedUp = await authPost(
    page.request,
    "/api/auth/sign-up/email",
    {
      name: "M7 reviewer",
      email: `m7-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
    process.env.AUTH_URL!,
  );
  expect(signedUp.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: "UTC" } })
    ).ok(),
  ).toBe(true);
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem("taff-locale", locale);
      localStorage.setItem("taff-theme", "light");
    },
    { locale },
  );
  const workspace = me.workspaces[0];
  const agents = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${workspace.id}`)
    ).json(),
  );
  const agent = agents.find((member) => member.kind === "agent");
  if (!agent) throw new Error("Seeded account agent required");
  const response = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId: workspace.id,
      memberId: agent.id,
      name: "Twin summary reader",
      scopes: ["tasks:read", "summaries:read"],
    },
  });
  expect(response.status()).toBe(201);
  const issued = issuedAgentTokenSchema.parse(await response.json());
  try {
    const fixture = { en: english, "zh-CN": simplified, "zh-HK": traditional }[
      locale
    ];
    const id = "8e2a60c6-772a-4b71-b144-c1e084f5d22a";
    const summary = dailySummarySchema.parse({
      ...fixture,
      watermark: {
        ...fixture.watermark,
        summaryId: id,
        text: fixture.watermark.text.replace("preview", id),
      },
      id,
      workspaceId: workspace.id,
      tagId: id,
      recipientId: id,
      localDate: fixture.snapshot.localDate,
      timeZone: fixture.snapshot.timeZone,
    });
    await page.route(`**/api/summaries/${id}`, (route) =>
      route.fulfill({ json: summary }),
    );
    await page.route(`**/api/summaries/${id}/shares`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto(`/summaries/${id}`);
    const document = page.getByTestId("summary-view");
    await expect(document.getByTestId("summary-project")).toBeVisible();
    await page.evaluate(prepareFonts, undefined);
    await expect(document).toHaveScreenshot("summary.png", {
      animations: "disabled",
    });

    await page.goto("/orgs/access");
    if (info.project.name.startsWith("desktop"))
      await expect(
        page
          .getByRole("complementary")
          .getByRole("link", { name: /M7 reviewer/ }),
      ).toBeVisible();
    const matrix = page.getByTestId("access-matrix");
    for (const tab of ["people", "agents", "tokens"] as const) {
      await page.getByRole("tab", { name: m.access[tab], exact: true }).click();
      await expect(matrix.locator("tbody tr").first()).toBeVisible();
      await page.evaluate(prepareFonts, undefined);
      await expect(page).toHaveScreenshot(`access-${tab}.png`, {
        animations: "disabled",
      });
    }
    await page
      .getByRole("button", { name: m.access.explain, exact: true })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", {
        name: m.agentProfile.permissions,
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(prepareFonts, undefined);
    await expect(drawer).toHaveScreenshot("access-explain.png", {
      animations: "disabled",
    });
    await page.keyboard.press("Escape");

    await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, true);
    await expect
      .poll(
        async () =>
          meSchema.parse(await (await page.request.get("/api/me")).json()).user
            .systemAdmin,
      )
      .toBe(true);
    const system = systemAccessMatrixSchema.parse(
      await (await page.request.get("/api/admin/access-matrix")).json(),
    );
    // Stable fixture columns across PostgreSQL collation providers.
    system.organizations = orderVisualOrganizations(system.organizations);
    // Keep real organization/grant rows; exclude previous captures' tokens.
    system.tokens = system.tokens.filter((token) => token.id === issued.id);
    await page.route("**/api/admin/access-matrix", (route) =>
      route.fulfill({ json: system }),
    );
    await page.goto("/admin/access");
    if (info.project.name.startsWith("desktop"))
      await expect(
        page
          .getByRole("complementary")
          .getByRole("link", { name: /M7 reviewer/ }),
      ).toBeVisible();
    const systemMatrix = page.getByTestId("system-access-matrix");
    await expect(systemMatrix.locator("tbody tr").first()).toBeVisible();
    await page.evaluate(prepareFonts, undefined);
    await expect(page).toHaveScreenshot("access-system.png", {
      animations: "disabled",
    });
  } finally {
    await setLocalTestSystemAdmin(process.env.DATABASE_URL!, me.user.id, false);
    expect(
      (await page.request.delete(`/api/agent-tokens/${issued.id}`)).ok(),
    ).toBe(true);
  }
});
