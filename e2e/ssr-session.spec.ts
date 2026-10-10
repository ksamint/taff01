import { type APIRequestContext, expect, test } from "@playwright/test";
import { meSchema } from "../packages/schemas/src/base";
import {
  calendarCivilTime,
  calendarWallToInstant,
} from "../packages/schemas/src/calendar";
import { messages, type TestLocale } from "./support/account";

test.use({ timezoneId: "Asia/Tokyo" });

async function account(
  request: APIRequestContext,
  locale: TestLocale,
  name: string,
  tz = "Asia/Tokyo",
) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  expect(
    (
      await request.post("/api/auth/sign-up/email", {
        headers: { Origin: process.env.AUTH_URL! },
        data: {
          name,
          email: `ssr-${crypto.randomUUID()}@example.test`,
          password: process.env.DEMO_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await request.patch("/api/profile", { data: { locale, tz } })).status(),
  ).toBe(200);
  return meSchema.parse(await (await request.get("/api/me")).json());
}

test("server account identity stays private and read-only until the browser confirms its current account", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const alice = await account(page.request, locale, "SSR Alice", "UTC");
  const workspace = alice.workspaces[0];
  const privateTitle = `SSR private due task ${crypto.randomUUID()}`;
  const scheduleTitle = `SSR private calendar ${crypto.randomUUID()}`;
  const localDate = calendarCivilTime(new Date(), alice.user.tz)
    .toISOString()
    .slice(0, 10);
  for (const [title, fields] of [
    [
      privateTitle,
      { dueAt: calendarWallToInstant(`${localDate}T12:00`, alice.user.tz) },
    ],
    [
      scheduleTitle,
      {
        labels: ["meeting"],
        calendar: {
          startAt: calendarWallToInstant(`${localDate}T12:00`, alice.user.tz),
          endAt: calendarWallToInstant(`${localDate}T13:00`, alice.user.tz),
          timeZone: alice.user.tz,
          rrule: null,
        },
      },
    ],
  ] as const) {
    expect(
      (
        await page.request.post("/api/tasks", {
          data: {
            workspaceId: workspace.id,
            ownerId: workspace.memberId,
            title,
            ...fields,
          },
        })
      ).status(),
    ).toBe(201);
  }
  const aliceCookies = await page.context().cookies();
  const other = await browser.newContext({ baseURL: process.env.AUTH_URL });
  let releaseScripts!: () => void;
  let releaseMe!: () => void;
  const scripts = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const session = new Promise<void>((resolve) => {
    releaseMe = resolve;
  });
  const profileWrites: string[] = [];
  const protectedReads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/profile" && request.method() === "PATCH")
      profileWrites.push(path);
    if (
      [
        "/api/tasks",
        "/api/members",
        "/api/runs",
        "/api/calendar",
        "/api/projects",
        "/api/inbox",
        "/api/me/notifications",
        "/api/workspace-access",
      ].includes(path) ||
      /^\/api\/workspaces\/[^/]+\/access$/.test(path)
    )
      protectedReads.push(path);
  });
  await page.addInitScript(() => {
    const fetcher = window.fetch;
    window.fetch = (input, options) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, window.location.href).pathname === "/api/me")
        document.documentElement.dataset.clientSessionRead = "pending";
      return fetcher(input, options);
    };
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scripts;
    await route.continue();
  });
  await page.route("**/api/me", async (route) => {
    await session;
    await route.continue();
  });
  try {
    const bobLocale: TestLocale = locale === "en" ? "zh-HK" : "en";
    const bob = await account(
      other.request,
      bobLocale,
      "SSR Bob",
      "America/Los_Angeles",
    );
    await page.route(new URL("/", process.env.AUTH_URL).href, async (route) => {
      const response = await route.fetch();
      await page.context().clearCookies();
      await page.context().addCookies(await other.cookies());
      await route.fulfill({ response });
    });
    const response = await page.goto("/", { waitUntil: "commit" });
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(response!.headers()["cache-control"]).toContain("private");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    expect(html).toContain("SSR Alice");
    expect(html).toContain(privateTitle);
    expect(html).toContain(scheduleTitle);
    for (const cookie of aliceCookies.filter(({ name }) =>
      name.includes("session_token"),
    ))
      expect(html.includes(cookie.value)).toBe(false);
    await expect(page.locator(".today-avatar-link")).toHaveAttribute(
      "aria-label",
      messages[locale].me.signedInAs.replace("{{name}}", alice.user.name),
    );
    // App scripts are still held: both the due list and calendar must already
    // be visible from authenticated HTML, rather than hydration or IDB.
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    await expect(page.locator(".today-task-title")).toHaveText(privateTitle);
    await expect(page.locator(".today-task-title")).toBeVisible();
    await expect(page.locator(".today-block-title")).toContainText([
      scheduleTitle,
    ]);
    await expect(
      page.locator(".today-block-title").filter({ hasText: scheduleTitle }),
    ).toBeVisible();
    releaseScripts();
    await expect(page.locator("html")).toHaveAttribute(
      "data-client-session-read",
      "pending",
    );
    await expect(page.locator("main.content")).toHaveAttribute("inert", "");
    await expect(page.getByTestId("open-quick")).toBeDisabled();
    await expect(page.getByTestId("quick-title")).toHaveCount(0);
    await expect(page.getByTestId("quick-create")).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(profileWrites).toEqual([]);
    expect(protectedReads).toEqual([]);
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    await expect(page.getByTestId("foreground-notification")).toHaveCount(0);
    releaseMe();
    await expect(page.getByTestId("today-heading")).toHaveText(
      messages[bobLocale].today,
    );
    await expect(page.getByTestId("open-quick")).toBeEnabled();
    await expect(page.getByTestId("task-card")).toHaveCount(0);
    await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByText(scheduleTitle, { exact: true })).toHaveCount(0);
    await expect(page.locator(".today-avatar-link")).toHaveAttribute(
      "aria-label",
      messages[bobLocale].me.signedInAs.replace("{{name}}", bob.user.name),
    );
    const confirmed = meSchema.parse(
      await (await page.request.get("/api/me")).json(),
    );
    expect(confirmed.user).toMatchObject({
      id: bob.user.id,
      locale: bobLocale,
      tz: "America/Los_Angeles",
    });
    expect(profileWrites).toEqual([]);
  } finally {
    releaseScripts();
    releaseMe();
    await other.close();
  }
});

test("matching browser confirmation retains the server task while protected reads reconcile", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await account(page.request, locale, "SSR same account");
  const workspace = me.workspaces[0];
  const title = `SSR retained task ${crypto.randomUUID()}`;
  expect(
    (
      await page.request.post("/api/tasks", {
        data: { workspaceId: workspace.id, ownerId: workspace.memberId, title },
      })
    ).status(),
  ).toBe(201);
  let releaseMe!: () => void;
  let releaseTasks!: () => void;
  const confirmation = new Promise<void>((resolve) => {
    releaseMe = resolve;
  });
  const reconciliation = new Promise<void>((resolve) => {
    releaseTasks = resolve;
  });
  await page.route("**/api/me", async (route) => {
    await confirmation;
    await route.continue();
  });
  await page.route("**/api/tasks?*", async (route) => {
    await reconciliation;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const task = page.locator(".today-task-title").filter({ hasText: title });
    await expect(task).toBeVisible();
    await expect(page.getByTestId("open-quick")).toBeDisabled();
    await page.evaluate((privateTitle) => {
      const state = { removed: false };
      Object.assign(window, { ssrTaskState: state });
      new MutationObserver((records) => {
        if (
          records.some((record) =>
            Array.from(record.removedNodes).some((node) =>
              node.textContent?.includes(privateTitle),
            ),
          )
        )
          state.removed = true;
      }).observe(document.querySelector("main.content")!, {
        childList: true,
        subtree: true,
      });
    }, title);
    releaseMe();
    await expect(page.getByTestId("open-quick")).toBeEnabled();
    await expect(task).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { ssrTaskState: { removed: boolean } })
            .ssrTaskState.removed,
      ),
    ).toBe(false);
    releaseTasks();
    await expect(task).toBeVisible();
  } finally {
    releaseMe();
    releaseTasks();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const signedIn of [false, true]) {
  test(`fresh session failure can retry after a ${signedIn ? "signed-in" : "null"} server bootstrap`, async ({
    page,
  }, info) => {
    const locale = info.project.name as TestLocale;
    if (signedIn) await account(page.request, locale, "SSR Retry");
    let failing = true;
    await page.route("**/api/me", async (route) => {
      if (failing)
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "internal_error" }),
        });
      else await route.continue();
    });
    await page.goto("/");
    const retry = page.getByRole("button", {
      name: messages[locale].retry,
      exact: true,
    });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    failing = false;
    await retry.click();
    if (signedIn) await expect(page.getByTestId("open-quick")).toBeEnabled();
    else await expect(page.getByTestId("auth-submit")).toBeVisible();
    await expect(
      page.getByTestId(signedIn ? "open-quick" : "locale-select"),
    ).toBeEnabled();
  });
}
