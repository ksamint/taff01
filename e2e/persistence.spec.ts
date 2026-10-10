import { expect, type Page, test } from "@playwright/test";
import type { ReadSnapshot } from "../apps/web/src/lib/cache-persistence";
import {
  calendarWallToInstant,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { openCalendarTools } from "./support/calendar";
import { openQuickAdd } from "./support/tasks";

test.use({ actionTimeout: 15000 });
async function readCache(page: Page): Promise<ReadSnapshot | null> {
  return page.evaluate(async () => {
    if (
      !(await indexedDB.databases()).some(
        (entry) => entry.name === "taff-read-cache",
      )
    )
      return null;
    return new Promise<ReadSnapshot | null>((resolve, reject) => {
      const request = indexedDB.open("taff-read-cache", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cache", "readonly");
        const read = tx.objectStore("cache").get("snapshot");
        let value: ReadSnapshot | null = null;
        read.onsuccess = () => {
          value = read.result ?? null;
        };
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  });
}
async function writeCache(page: Page, value: ReadSnapshot) {
  await page.evaluate(
    (snapshot) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("taff-read-cache", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("cache", "readwrite");
          tx.objectStore("cache").put(snapshot, "snapshot");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
    value,
  );
}

test("IndexedDB restores authorized lists board and calendar before real reconciliation in the saved locale", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: me.user.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: { name: `Saved project ${locale}` },
      })
    ).json(),
  );
  const task = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          projectId: project.id,
          title: `Cached task ${locale}`,
          calendar: {
            startAt: calendarWallToInstant(`${date}T10:00`, me.user.tz),
            endAt: calendarWallToInstant(`${date}T11:00`, me.user.tz),
            timeZone: me.user.tz,
            rrule: null,
          },
        },
      })
    ).json(),
  );
  await expect(
    page.getByRole("link", { name: task.title, exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await readCache(page))?.queries.some(
        (query) => query.key[0] === "tasks",
      ),
    )
    .toBe(true);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect
    .poll(async () =>
      (await readCache(page))?.queries.some(
        (query) => query.key[0] === "projects",
      ),
    )
    .toBe(true);
  await page.goto("/calendar");
  await expect(
    page.locator(".sx__event").filter({ hasText: task.title }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await readCache(page))?.queries
        .map((query) => query.key[0])
        .sort()
        .join(","),
    )
    .toBe("calendar,projects,tasks");
  const before = await readCache(page);
  expect(before?.userId).toBe(me.user.id);
  expect(
    before?.queries.some(
      (query) =>
        !["tasks", "projects", "calendar"].includes(String(query.key[0])),
    ),
  ).toBe(false);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  for (const pattern of ["**/api/tasks?**", "**/api/calendar?**"])
    await page.route(pattern, async (route) => {
      await gate;
      await route.continue();
    });
  const renamed = `${task.title} updated`;
  const changed = await page.request.patch(`/api/tasks/${task.id}`, {
    data: { version: task.version, title: renamed },
  });
  expect(changed.status()).toBe(200);
  await page.goto("/");
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale].today,
  );
  await expect(
    page.getByRole("link", { name: task.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: renamed, exact: true }),
  ).toHaveCount(0);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(
    page.getByRole("link", { name: task.title, exact: true }),
  ).toBeVisible();
  await page.goto("/calendar");
  await openCalendarTools(page);
  await page.getByTestId("calendar-list").click();
  const item = page
    .locator(".calendar-list-item")
    .filter({ hasText: task.title });
  await expect(item).toBeVisible();
  await item.getByRole("button").first().click();
  await expect(page.getByTestId("schedule-save")).toBeDisabled();
  await page
    .getByRole("button", { name: messages[locale].planning.close, exact: true })
    .click();
  release();
  await expect(
    page.getByRole("link", { name: renamed, exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => JSON.stringify((await readCache(page))?.queries))
    .toContain(renamed);
  await expect(page.locator("body")).not.toContainText(
    /(?:notifications|digest|pwa)\.[a-zA-Z]+/,
  );
});

test("durable cache never records pending rollback data and revocation rejects a previous account snapshot", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const original = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Private cached ${locale}`,
        },
      })
    ).json(),
  );
  await expect(
    page.getByRole("link", { name: original.title, exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => JSON.stringify(await readCache(page)))
    .toContain(original.title);
  const previous = await readCache(page);
  expect(previous).not.toBeNull();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    entered();
    await gate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  const pending = `Pending never saved ${locale}`;
  await openQuickAdd(page);
  await page.getByTestId("quick-title").fill(pending);
  await page.getByTestId("quick-create").click();
  await requested;
  await expect(page.getByText(pending, { exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  expect(JSON.stringify(await readCache(page))).not.toContain(pending);
  release();
  await expect(page.getByText(pending, { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => JSON.stringify(await readCache(page)))
    .toContain(original.title);
  await page.unroute("**/api/tasks");
  const remote = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    storageState: await page.context().storageState(),
  });
  try {
    expect(
      (
        await remote.request.post("/api/auth/sign-out", {
          data: {},
          headers: { Origin: process.env.AUTH_URL! },
        })
      ).status(),
    ).toBe(200);
    await expect(page.getByTestId("auth-submit")).toBeVisible({
      timeout: 1000,
    });
    await expect.poll(() => readCache(page)).toBeNull();
  } finally {
    await remote.close();
  }
  const bob = await freshAccount(page, locale);
  await writeCache(page, previous!);
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale].today,
  );
  await expect(
    page.getByRole("link", { name: original.title, exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await readCache(page))?.userId)
    .toBe(bob.user.id);
});

test("PWA caches only public resources refreshes stable locales and falls back to a neutral localized offline shell", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const manifest = await page.evaluate(async () =>
    (await fetch("/manifest.webmanifest")).json(),
  );
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  const refreshed = await page.evaluate(async (language) => {
    const name =
      (await caches.keys()).find((key) => key.startsWith("taff-public-")) ??
      "taff-public-dev";
    const cache = await caches.open(name);
    await cache.put(
      `/locales/${language}`,
      new Response(JSON.stringify({ today: "Outdated cached locale" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const response = await fetch(`/locales/${language}`);
    await fetch(`/icons/taff-192.png?private=excluded`);
    await fetch(`/locales/${language}`, {
      headers: { RSC: "1", "Next-Router-Prefetch": "1" },
    });
    await fetch("/api/me");
    await fetch("/me");
    await fetch("/mcp");
    return {
      body: await response.json(),
      paths: (await cache.keys()).map(
        (request) =>
          new URL(request.url).pathname + new URL(request.url).search,
      ),
    };
  }, locale);
  expect(refreshed.body.today).toBe(messages[locale].today);
  expect(
    refreshed.paths.some(
      (path) =>
        /^\/(?:api|mcp|auth|me)(?:\/|$)/.test(path) ||
        path.includes("?") ||
        path.includes("_rsc"),
    ),
  ).toBe(false);
  await page.context().setOffline(true);
  try {
    await page.goto("/me");
    await expect(
      page.getByRole("heading", { name: messages[locale].pwa.offlineTitle }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(me.user.email);
    await expect(page.getByTestId("today-heading")).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
  }
  await page
    .getByRole("link", { name: messages[locale].pwa.reconnect, exact: true })
    .click();
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale].today,
  );
});
