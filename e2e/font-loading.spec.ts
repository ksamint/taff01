import { expect, test } from "@playwright/test";
import {
  meSchema,
  projectSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { prototypeId } from "../packages/schemas/src/prototype-data";
import { prepareFonts } from "../scripts/ui/prepare-fonts";
import { prepareView } from "../scripts/ui/prepare-view";

// UI language does not determine user-content language. The Northwind visual
// fixture has Chinese task/contact names even in English, so its CJK requests
// are legitimate and must load only applicable small Unicode pages. This
// isolated English workspace reproduces the arrow-only
// download that previously pulled the entire 225 KB remaining CJK subset.
test("English Relations loads its arrow without the remaining CJK font", async ({
  page,
}) => {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  const headers = { Origin: process.env.AUTH_URL! };
  const signedIn = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: {
      email: process.env.DEMO_EMAIL ?? "alex@taff.local",
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signedIn.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", {
        headers,
        data: { locale: "en", tz: "UTC" },
      })
    ).status(),
  ).toBe(200);
  const response = await page.request.post("/api/workspaces", {
    headers,
    data: { name: `Font regression ${crypto.randomUUID()}` },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { headers, data: { name: "English font fixture" } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  await page.addInitScript(
    ({ userId, workspaceId }) => {
      sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
      localStorage.setItem("taff:last-workspace", workspaceId);
      localStorage.setItem("taff-locale", "en");
      localStorage.setItem("taff-theme", "light");
    },
    { userId: me.user.id, workspaceId: workspace.id },
  );
  await page.goto(`/projects/${project.id}?view=relations`);
  await expect(page.getByTestId("relations-layer-people")).toHaveText(
    "People ↔ tasks",
  );
  await expect(page.getByTestId("relations-node").first()).toBeVisible();
  await prepareView(page, "relations");
  await page.evaluate(prepareFonts);
  const resources = await page.evaluate(() => ({
    text: document.body.innerText,
    fonts: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/fonts/")),
  }));
  expect(resources.text).not.toMatch(/[\u3400-\u9fff]/);
  expect(
    resources.fonts.some((url) => url.endsWith("/NotoSansTC-ui-symbols.woff2")),
  ).toBe(true);
  expect(
    resources.fonts.some((url) =>
      url.endsWith("/NotoSansTC-ui-remaining.woff2"),
    ),
  ).toBe(false);
  expect(
    resources.fonts.filter((url) =>
      /\/NotoSansTC-ui-(?:content|details)-|\/NotoSansSC-ui\.woff2/.test(url),
    ),
  ).toEqual([]);
});

test("Northwind English Relations downloads bounded CJK pages for its real business names", async ({
  page,
}, info) => {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  const headers = { Origin: process.env.AUTH_URL! };
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers,
        data: {
          email: process.env.DEMO_EMAIL ?? "alex@taff.local",
          password: process.env.DEMO_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", {
        headers,
        data: { locale: "en", tz: "UTC" },
      })
    ).status(),
  ).toBe(200);
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const workspaceId = prototypeId("workspace", "nw");
  expect(me.workspaces.some((workspace) => workspace.id === workspaceId)).toBe(
    true,
  );
  await page.addInitScript(
    ({ userId, workspaceId }) => {
      sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
      localStorage.setItem("taff:last-workspace", workspaceId);
      localStorage.setItem("taff-locale", "en");
      localStorage.setItem("taff-theme", "light");
    },
    { userId: me.user.id, workspaceId },
  );
  await page.goto(`/projects/${prototypeId("project", "nw")}?view=relations`);
  await expect(page.getByTestId("relations-layer-people")).toHaveText(
    "People ↔ tasks",
  );
  await expect(page.getByTestId("relations-node").first()).toBeVisible();
  await prepareView(page, "relations");
  await page.evaluate(prepareFonts);
  const resources = await page.evaluate(() => ({
    text: document.body.innerText,
    fonts: [
      ...new Map(
        performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name.includes("/fonts/"))
          .map((entry) => [
            entry.name,
            {
              file: new URL(entry.name).pathname.split("/").at(-1)!,
              bytes: (entry as PerformanceResourceTiming).encodedBodySize,
            },
          ]),
      ).values(),
    ],
  }));
  expect(resources.text).toMatch(/[\u3400-\u9fff]/);
  expect(
    resources.fonts.some((font) => font.file === "NotoSansTC-ui-symbols.woff2"),
  ).toBe(true);
  expect(
    resources.fonts.some(
      (font) => font.file === "NotoSansTC-ui-remaining.woff2",
    ),
  ).toBe(false);
  const chunks = resources.fonts.filter((font) =>
    /^NotoSansTC-ui-(content|details)-/.test(font.file),
  );
  expect(chunks.length).toBeGreaterThan(0);
  for (const font of chunks) {
    expect(font.bytes).toBeGreaterThan(0);
    expect(font.bytes).toBeLessThanOrEqual(48 * 1024);
  }
  const remainderBytes = chunks.reduce((sum, font) => sum + font.bytes, 0);
  expect(remainderBytes).toBeLessThan(224_900);
  await info.attach("northwind-English-relations-font-network.json", {
    body: JSON.stringify(
      {
        fonts: resources.fonts,
        remainderBytes,
        priorMonolithicRemainderBytes: 224900,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
