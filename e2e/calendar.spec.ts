import { expect, type Locator, type Page, test } from "@playwright/test";
import en from "../apps/web/locales/en/common.json";
import zhCN from "../apps/web/locales/zh-CN/common.json";
import zhHK from "../apps/web/locales/zh-HK/common.json";
import {
  calendarViewDataSchema,
  calendarWallToInstant,
  memberListSchema,
  meSchema,
  taskCalendarSchema,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";

const messages = { en, "zh-CN": zhCN, "zh-HK": zhHK };
type Locale = keyof typeof messages;
test.use({ actionTimeout: 15000 });
test("calendar member fetch failure explains disabled editor and Retry restores scheduling", async ({
  page,
}, info) => {
  const locale = info.project.name as Locale;
  const { me, workspace, date } = await setup(page, locale);
  const created = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: `Member recovery ${locale}`,
      calendar: {
        startAt: calendarWallToInstant(`${date}T09:00`, me.user.tz),
        endAt: calendarWallToInstant(`${date}T10:00`, me.user.tz),
        timeZone: me.user.tz,
        rrule: null,
      },
    },
  });
  expect(created.status()).toBe(201);
  const task = taskSchema.parse(await created.json());
  let recover = false;
  let failedRequests = 0;
  await page.route("**/api/members?**", async (route) => {
    if (
      !recover &&
      new URL(route.request().url()).searchParams.get("workspaceId") ===
        workspace.id
    ) {
      failedRequests++;
      await route.fulfill({ status: 500, json: { error: "internal_error" } });
    } else await route.continue();
  });
  await page.goto("/calendar");
  // Reload gives this authenticated workspace a fresh query cache.
  await page.reload();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages[locale].errors.internal_error }),
  ).toBeVisible();
  expect(failedRequests).toBeGreaterThanOrEqual(2);
  await page.getByTestId("calendar-list").click();
  await page
    .locator(".calendar-list-item")
    .filter({ hasText: task.title })
    .getByRole("button")
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText(
    messages[locale].errors.internal_error,
  );
  await expect(page.getByTestId("schedule-save")).toBeDisabled();
  await expect(page.getByTestId("schedule-clear")).toBeDisabled();
  const originalStart = await page.getByTestId("schedule-start").inputValue();
  recover = true;
  const recovered = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/members" &&
      response.status() === 200,
  );
  await dialog
    .getByRole("button", { name: messages[locale].retry, exact: true })
    .click();
  await recovered;
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("schedule-start")).toHaveValue(originalStart);
  await expect(page.getByTestId("schedule-save")).toBeEnabled();
  await expect(page.getByTestId("schedule-clear")).toBeEnabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.getByTestId("schedule-start").fill(`${date}T11:00`);
  await page.getByTestId("schedule-end").fill(`${date}T12:00`);
  let calendarWrites = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/tasks/${task.id}/calendar`
    )
      calendarWrites++;
  });
  const saved = patchAck(page, task.id);
  await page.getByTestId("schedule-save").click();
  expect((await saved).status()).toBe(200);
  expect(calendarWrites).toBe(1);
  expect((await stored(page, task.id)).schedule?.startAt).toBe(
    calendarWallToInstant(`${date}T11:00`, me.user.tz),
  );
});
async function setup(page: Page, locale: Locale, withAgent = false) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  const signedIn = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/sign-in/email" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("auth-submit").click();
  expect((await signedIn).status()).toBe(200);
  await expect(page.getByTestId("today-heading")).toBeVisible({
    timeout: 15000,
  });
  await page.getByTestId("locale-select").selectOption(locale);
  await expect(page.getByTestId("locale-select")).toBeEnabled();
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const agentIds: string[] = [];
  if (withAgent) {
    for (const workspace of me.workspaces) {
      const members = memberListSchema.parse(
        await (
          await page.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      );
      const agent = members.find((member) => member.kind === "agent");
      if (
        agent &&
        members.some(
          (member) => member.userId === me.user.id && member.role === "admin",
        )
      ) {
        agentIds.push(agent.id);
        break;
      }
    }
    expect(agentIds).toHaveLength(1);
  }
  const response = await page.request.post("/api/workspaces", {
    data: { name: `Calendar ${locale} ${Date.now()}`, agentIds },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: me.user.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { me, workspace, date };
}
async function stored(page: Page, id: string) {
  const response = await page.request.get(`/api/tasks/${id}/calendar`);
  expect(response.status()).toBe(200);
  return taskCalendarSchema.parse(await response.json());
}
function patchAck(page: Page, id: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/tasks/${id}/calendar`,
  );
}
async function moveEvent(page: Page, id: string, dy: number) {
  const event = page.locator(
    `.sx__time-grid-event[data-event-id="occurrence-${id.slice(0, 36)}-${Date.parse(id.slice(37))}"]`,
  );
  await event.scrollIntoViewIfNeeded();
  const box = await event.boundingBox();
  if (!box) throw new Error("Missing calendar event");
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.move(box.x + box.width / 2, box.y + 18 + dy, { steps: 8 });
  await page.mouse.up();
}
async function safeBox(locator: Locator) {
  await locator.evaluate((element) =>
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    }),
  );
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing gesture geometry");
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          document
            .elementFromPoint(
              rect.x + Math.min(30, rect.width / 2),
              rect.y + 18,
            )
            ?.closest(".sx__event") === element
        );
      }),
    )
    .toBe(true);
  return box;
}
async function touchGesture(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cancel = false,
) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...from, id: 1 }],
  });
  await page.waitForTimeout(250);
  for (let index = 1; index <= 8; index++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * index) / 8,
          y: from.y + ((to.y - from.y) * index) / 8,
          id: 1,
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}
function offsetDay(date: string, delta: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

test("calendar real day drag, bottom-edge resize and whole-series undo preserve deadline", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as Locale;
  const { me, workspace, date } = await setup(page, locale);
  const previousDay = new Date(`${date}T12:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const anchorDate = previousDay.toISOString().slice(0, 10);
  const startAt = calendarWallToInstant(`${anchorDate}T09:00`, me.user.tz);
  const endAt = calendarWallToInstant(`${anchorDate}T10:00`, me.user.tz);
  const dueAt = new Date(Date.parse(startAt) + 86400456).toISOString();
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: `Calendar gesture ${locale}`,
      dueAt,
      calendar: {
        startAt,
        endAt,
        timeZone: me.user.tz,
        rrule: "FREQ=DAILY;COUNT=3",
      },
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  await page.goto("/calendar");
  const occurrence = (await stored(page, task.id)).schedule;
  expect(occurrence).not.toBeNull();
  const view = calendarViewDataSchema.parse(
    await (
      await page.request.get(
        `/api/calendar?${new URLSearchParams({ workspaceId: workspace.id, from: calendarWallToInstant(`${date}T00:00`, me.user.tz), to: new Date(Date.parse(calendarWallToInstant(`${date}T00:00`, me.user.tz)) + 86400000).toISOString() })}`,
      )
    ).json(),
  );
  const id = view.occurrences[0].id;
  await expect(
    page.locator(".sx__time-grid-event").filter({ hasText: task.title }),
  ).toBeVisible();
  const moved = patchAck(page, task.id);
  await moveEvent(page, id, 56);
  expect((await moved).status()).toBe(200);
  const after = await stored(page, task.id);
  expect(after.schedule?.startAt).toBe(
    new Date(Date.parse(startAt) + 3600000).toISOString(),
  );
  expect(after.task.dueAt).toBe(dueAt);
  expect(after.schedule?.rrule).toContain("FREQ=DAILY");
  expect(after.schedule?.rrule).toContain("COUNT=3");
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  const event = page
    .locator(".sx__time-grid-event")
    .filter({ hasText: task.title })
    .first();
  const handle = event.locator(".sx__time-grid-event-resize-handle");
  await safeBox(event);
  const box = await handle.boundingBox();
  if (!box) throw new Error("Missing resize handle");
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.classList.contains("sx__time-grid-event-resize-handle"),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ),
  ).toBe(true);
  const resized = patchAck(page, task.id);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 28, {
    steps: 8,
  });
  await page.mouse.up();
  expect((await resized).status()).toBe(200);
  const extended = await stored(page, task.id);
  expect(extended.schedule?.endAt).toBe(
    new Date(Date.parse(endAt) + 5400000).toISOString(),
  );
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  const undone = patchAck(page, task.id);
  await page.getByTestId("calendar-undo").click();
  expect((await undone).status()).toBe(200);
  expect((await stored(page, task.id)).schedule?.endAt).toBe(
    after.schedule?.endAt,
  );
  expect((await stored(page, task.id)).task.dueAt).toBe(dueAt);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute(
    "data-prefers-dark",
    "true",
  );
  expect(
    await page
      .locator(".sx__calendar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveAttribute(
    "data-prefers-dark",
    "false",
  );
  // The same repeating series can move horizontally in the phone's scrollable week.
  await page.getByTestId("calendar-week").click();
  const weekEvent = page.locator(
    `.sx__time-grid-event[data-event-id="occurrence-${task.id}-${Date.parse(calendarWallToInstant(`${date}T10:00`, me.user.tz))}"]`,
  );
  const weekBox = await safeBox(weekEvent);
  const dayWidth = await weekEvent.evaluate(
    (el) => el.closest(".sx__time-grid-day")!.getBoundingClientRect().width,
  );
  const weekAck = patchAck(page, task.id);
  await page.mouse.move(weekBox.x + 20, weekBox.y + 18);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(weekBox.x + 20 + dayWidth, weekBox.y + 18, {
    steps: 8,
  });
  await page.mouse.up();
  expect((await weekAck).status()).toBe(200);
  expect((await stored(page, task.id)).schedule?.startAt).toBe(
    calendarWallToInstant(`${date}T10:00`, me.user.tz),
  );
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  const weekUndo = patchAck(page, task.id);
  await page.getByTestId("calendar-undo").click();
  expect((await weekUndo).status()).toBe(200);
  expect((await stored(page, task.id)).schedule?.startAt).toBe(
    after.schedule?.startAt,
  );
  // Month uses the same native PointerEvents path on desktop and phone.
  const desktopContext = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL: process.env.AUTH_URL,
    viewport: { width: 1280, height: 960 },
    locale: locale === "en" ? "en-US" : locale,
  });
  try {
    const desktop = await desktopContext.newPage();
    await desktop.goto("/orgs");
    await desktop.getByTestId(`workspace-${workspace.id}`).click();
    await desktop.goto("/calendar");
    await desktop.getByTestId("calendar-month-grid").click();
    const monthAnchor = desktop.locator(
      `.sx__month-grid-event[data-event-id="occurrence-${task.id}-${Date.parse(after.schedule!.startAt)}"]`,
    );
    await expect(monthAnchor).toBeVisible();
    await monthAnchor.evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await expect
      .poll(() =>
        monthAnchor.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(r.x + 12, r.y + 10)
              ?.closest(".sx__event") === el
          );
        }),
      )
      .toBe(true);
    let monthWrites = 0;
    const countMonth = (request: import("@playwright/test").Request) => {
      if (
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === `/api/tasks/${task.id}/calendar`
      )
        monthWrites++;
    };
    desktop.on("request", countMonth);
    const monthAck = patchAck(desktop, task.id);
    const monthBox = await monthAnchor.boundingBox();
    const monthCell = await desktop
      .locator(`.sx__month-grid-day[data-date="${date}"]`)
      .boundingBox();
    if (!monthBox || !monthCell)
      throw new Error("Missing native month geometry");
    await desktop.mouse.move(monthBox.x + 12, monthBox.y + 10);
    await desktop.mouse.down();
    await desktop.waitForTimeout(250);
    await desktop.mouse.move(
      monthCell.x + monthCell.width / 2,
      monthCell.y + monthCell.height / 2,
      { steps: 8 },
    );
    await desktop.mouse.up();
    expect((await monthAck).status()).toBe(200);
    await expect(desktop.getByTestId("calendar-undo")).toBeEnabled();
    expect(monthWrites).toBe(1);
    desktop.off("request", countMonth);
    expect((await stored(desktop, task.id)).schedule?.startAt).toBe(
      calendarWallToInstant(`${date}T10:00`, me.user.tz),
    );
    expect((await stored(desktop, task.id)).schedule?.rrule).toBe(
      "FREQ=DAILY;COUNT=3",
    );
    expect((await stored(desktop, task.id)).task.dueAt).toBe(dueAt);
  } finally {
    await desktopContext.close();
  }
  await expect(
    page.getByRole("heading", {
      name: messages[locale].calendar.title,
      exact: true,
    }),
  ).toBeVisible();
});

test("calendar stale edits retain draft, failures restore cache, saved fold zone stays exact and browsers converge", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const { me, workspace, date } = await setup(page, locale);
  const startAt = calendarWallToInstant(`${date}T09:00`, me.user.tz);
  const endAt = calendarWallToInstant(`${date}T10:00`, me.user.tz);
  const title = `<img src=x onerror="window.calendarUnsafe=true"> ${locale}`;
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title,
      calendar: { startAt, endAt, timeZone: me.user.tz, rrule: null },
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  await page.goto("/calendar");
  await expect(
    page.locator(".sx__time-grid-event").filter({ hasText: title }),
  ).toBeVisible();
  await expect(page.locator(".sx__event img")).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "calendarUnsafe")),
  ).toBeUndefined();
  const other = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL: process.env.AUTH_URL,
    viewport: { width: 393, height: 851 },
    locale: locale === "en" ? "en-US" : locale,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const second = await other.newPage();
    await second.goto("/orgs");
    await second.getByTestId(`workspace-${workspace.id}`).click();
    await second.goto("/calendar");
    await expect(
      second.locator(".sx__time-grid-event").filter({ hasText: title }),
    ).toBeVisible();
    const changed = await second.request.patch(
      `/api/tasks/${task.id}/calendar`,
      {
        data: {
          version: task.version,
          schedule: {
            startAt: calendarWallToInstant(`${date}T10:00`, me.user.tz),
            endAt: calendarWallToInstant(`${date}T11:00`, me.user.tz),
            timeZone: me.user.tz,
            rrule: null,
          },
        },
      },
    );
    expect(changed.status()).toBe(200);
    const v2 = taskCalendarSchema.parse(await changed.json());
    const id2 = `occurrence-${task.id}-${Date.parse(v2.schedule!.startAt)}`;
    await expect(
      page.locator(`.sx__time-grid-event[data-event-id="${id2}"]`),
    ).toBeVisible({ timeout: 1000 });
    await expect(
      second.locator(`.sx__time-grid-event[data-event-id="${id2}"]`),
    ).toBeVisible();
    await second
      .locator(`.sx__time-grid-event[data-event-id="${id2}"]`)
      .click();
    await second.getByRole("dialog").getByRole("link").click();
    await expect(second.getByTestId("task-schedule")).toBeEnabled();
    expect(
      await second.evaluate(() => document.documentElement.scrollWidth <= 393),
    ).toBe(true);
    await second.getByTestId("task-schedule").click();
    await second.getByTestId("schedule-start").fill(`${date}T12:00`);
    await second.getByTestId("schedule-end").fill(`${date}T13:00`);
    const changedAgain = await page.request.patch(
      `/api/tasks/${task.id}/calendar`,
      {
        data: {
          version: v2.task.version,
          schedule: {
            startAt: calendarWallToInstant(`${date}T11:00`, me.user.tz),
            endAt: calendarWallToInstant(`${date}T12:00`, me.user.tz),
            timeZone: me.user.tz,
            rrule: null,
          },
        },
      },
    );
    expect(changedAgain.status()).toBe(200);
    const v3 = taskCalendarSchema.parse(await changedAgain.json());
    await second
      .getByTestId("schedule-save")
      .evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
    const stale = patchAck(second, task.id);
    await second.getByTestId("schedule-save").click();
    expect((await stale).status()).toBe(409);
    await expect(second.getByRole("dialog").getByRole("alert")).toHaveText(
      messages[locale].errors.conflict,
    );
    await expect(second.getByTestId("schedule-start")).toHaveValue(
      `${date}T12:00`,
    );
    expect((await stored(page, task.id)).schedule?.startAt).toBe(
      v3.schedule?.startAt,
    );
    await second
      .getByRole("dialog")
      .getByRole("button", { name: messages[locale].planning.close })
      .click();
    await expect(second.getByTestId("task-schedule")).toBeEnabled();
    await second.getByTestId("task-schedule").click();
    await expect(second.getByTestId("schedule-start")).toHaveValue(
      `${date}T11:00`,
    );
    await second.getByTestId("schedule-start").fill(`${date}T12:00`);
    await second.getByTestId("schedule-end").fill(`${date}T13:00`);
    let release!: () => void;
    let arrived!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await second.route(`**/api/tasks/${task.id}/calendar`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      arrived();
      await gate;
      await route.fulfill({ status: 403, json: { error: "forbidden" } });
    });
    await second.getByTestId("schedule-save").click();
    await seen;
    await second
      .getByRole("dialog")
      .getByRole("button", { name: messages[locale].planning.close })
      .click();
    await second
      .getByRole("navigation", { name: messages[locale].nav.label })
      .getByRole("link", { name: messages[locale].nav.calendar, exact: true })
      .click();
    const pendingId = `occurrence-${task.id}-${Date.parse(calendarWallToInstant(`${date}T12:00`, me.user.tz))}`;
    await expect(
      second.locator(`.sx__time-grid-event[data-event-id="${pendingId}"]`),
    ).toBeVisible();
    release();
    const realId = `occurrence-${task.id}-${Date.parse(v3.schedule!.startAt)}`;
    await expect(
      second.locator(`.sx__time-grid-event[data-event-id="${realId}"]`),
    ).toBeVisible();
    await expect(
      second.locator(`.sx__time-grid-event[data-event-id="${pendingId}"]`),
    ).toHaveCount(0);
    expect((await stored(page, task.id)).task.version).toBe(v3.task.version);
  } finally {
    await other.close();
  }
  const fold = {
    startAt: "2026-11-01T06:30:45.123Z",
    endAt: "2026-11-01T07:30:45.123Z",
    timeZone: "America/New_York",
    rrule: null,
  };
  const folded = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: `Fold ${locale}`,
      calendar: fold,
    },
  });
  expect(folded.status()).toBe(201);
  const foldTask = taskSchema.parse(await folded.json());
  await page.goto(`/tasks/${foldTask.id}`);
  await expect(page.getByTestId("task-schedule")).toBeEnabled();
  await page.getByTestId("task-schedule").click();
  await expect(page.getByTestId("schedule-zone")).toHaveValue(
    "America/New_York",
  );
  await expect(page.getByTestId("schedule-start")).toHaveValue(
    "2026-11-01T01:30:45",
  );
  await page.getByTestId("schedule-repeat").selectOption("daily");
  await page.getByTestId("schedule-count").fill("2");
  const foldSaved = patchAck(page, foldTask.id);
  await page.getByTestId("schedule-save").click();
  expect((await foldSaved).status()).toBe(200);
  const savedFold = await stored(page, foldTask.id);
  expect(savedFold.schedule?.startAt).toBe(fold.startAt);
  expect(savedFold.schedule?.endAt).toBe(fold.endAt);
  expect(savedFold.schedule?.timeZone).toBe(fold.timeZone);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("task-schedule")).toBeEnabled();
  await page.getByTestId("task-schedule").click();
  await expect(page.getByTestId("schedule-repeat")).toHaveValue("daily");
  await expect(page.getByTestId("schedule-count")).toHaveValue("2");
});

test("calendar real agent lane separates concurrent human time and preserves native touch drag/resize", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const { me, workspace, date } = await setup(page, locale, true);
  const members = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${workspace.id}`)
    ).json(),
  );
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("Missing copied agent");
  const startAt = calendarWallToInstant(`${date}T09:00`, me.user.tz);
  const endAt = calendarWallToInstant(`${date}T10:00`, me.user.tz);
  const makeTask = async (title: string, workerId: string | null) => {
    const response = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        ownerId: workspace.memberId,
        workerId,
        title,
        calendar: { startAt, endAt, timeZone: me.user.tz, rrule: null },
      },
    });
    expect(response.status()).toBe(201);
    return taskSchema.parse(await response.json());
  };
  const humanTask = await makeTask(`Human time ${locale}`, null);
  const agentTask = await makeTask(`Agent time ${locale}`, agent.id);
  await page.goto("/calendar");
  const humanEvent = page
    .locator(
      ".calendar-day-lanes > .calendar-engine:not(.calendar-agent-engine) .sx__time-grid-event",
    )
    .filter({ hasText: humanTask.title });
  const agentEvent = page
    .locator(".calendar-agent-engine .sx__time-grid-event")
    .filter({ hasText: agentTask.title });
  await expect(humanEvent).toBeVisible();
  await expect(agentEvent).toBeVisible();
  await safeBox(agentEvent);
  const humanBox = await humanEvent.boundingBox();
  const agentBox = await agentEvent.boundingBox();
  if (!humanBox || !agentBox)
    throw new Error("Missing separated lane geometry");
  expect(Math.abs(humanBox.y - agentBox.y)).toBeLessThan(1);
  expect(Math.abs(humanBox.height - agentBox.height)).toBeLessThan(1);
  expect(humanBox.x + humanBox.width).toBeLessThanOrEqual(agentBox.x);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const moved = patchAck(page, agentTask.id);
  await touchGesture(
    page,
    { x: agentBox.x + agentBox.width / 2, y: agentBox.y + 18 },
    { x: agentBox.x + agentBox.width / 2, y: agentBox.y + 46 },
  );
  expect((await moved).status()).toBe(200);
  expect((await stored(page, agentTask.id)).schedule?.startAt).toBe(
    calendarWallToInstant(`${date}T09:30`, me.user.tz),
  );
  expect((await stored(page, humanTask.id)).schedule?.startAt).toBe(startAt);
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  await safeBox(agentEvent);
  const handle = await agentEvent
    .locator(".sx__time-grid-event-resize-handle")
    .boundingBox();
  if (!handle) throw new Error("Missing agent resize handle");
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.classList.contains("sx__time-grid-event-resize-handle"),
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    ),
  ).toBe(true);
  const resized = patchAck(page, agentTask.id);
  await touchGesture(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 + 28 },
  );
  expect((await resized).status()).toBe(200);
  expect((await stored(page, agentTask.id)).schedule?.endAt).toBe(
    calendarWallToInstant(`${date}T11:00`, me.user.tz),
  );
  await page.screenshot({
    path: `/tmp/taff-m6-${locale}-agent-lane.png`,
    fullPage: true,
  });
});

test("calendar phone touch, cancellation, month move, tray scheduling, empty-slot create and list navigation", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as Locale;
  const { me, workspace, date } = await setup(page, locale);
  const deadline = calendarWallToInstant(
    `${offsetDay(date, 3)}T23:59:59.456`,
    me.user.tz,
  );
  const created = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: `Tray ${locale}`,
      dueAt: deadline,
    },
  });
  const task = taskSchema.parse(await created.json());
  await page.goto("/calendar");
  await page.getByTestId(`schedule-task-${task.id}`).click();
  await page.getByTestId("schedule-start").fill(`${date}T09:00`);
  await page.getByTestId("schedule-end").fill(`${date}T10:00`);
  await page.getByTestId("schedule-repeat").selectOption("weekly");
  await page.getByTestId("schedule-count").fill("4");
  const scheduled = patchAck(page, task.id);
  await page.getByTestId("schedule-save").click();
  expect((await scheduled).status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const event = page
    .locator(".sx__time-grid-event")
    .filter({ hasText: task.title })
    .first();
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  const before = await safeBox(event);
  if (!before) throw new Error("Missing touch event");
  const moved = patchAck(page, task.id);
  await touchGesture(
    page,
    { x: before.x + 30, y: before.y + 18 },
    { x: before.x + 30, y: before.y + 46 },
  );
  expect((await moved).status()).toBe(200);
  const afterMove = await stored(page, task.id);
  expect(afterMove.schedule?.startAt).toBe(
    calendarWallToInstant(`${date}T09:30`, me.user.tz),
  );
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  const box = await safeBox(event);
  const writes: string[] = [];
  const countWrites = (request: import("@playwright/test").Request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/tasks/${task.id}/calendar`
    )
      writes.push(request.url());
  };
  page.on("request", countWrites);
  await touchGesture(
    page,
    { x: box.x + 30, y: box.y + 18 },
    { x: box.x + 30, y: box.y + 74 },
    true,
  );
  await expect(page.locator(".is-event-copy")).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(writes).toHaveLength(0);
  page.off("request", countWrites);
  expect((await stored(page, task.id)).task.version).toBe(
    afterMove.task.version,
  );
  const cancelledBox = await event.boundingBox();
  expect(Math.abs((cancelledBox?.y ?? -1000) - box.y)).toBeLessThan(1);
  await safeBox(event);
  const resizeHandle = event.locator(".sx__time-grid-event-resize-handle");
  const resizeBox = await resizeHandle.boundingBox();
  if (!resizeBox) throw new Error("Missing touch resize handle");
  const resized = patchAck(page, task.id);
  await touchGesture(
    page,
    {
      x: resizeBox.x + resizeBox.width / 2,
      y: resizeBox.y + resizeBox.height / 2,
    },
    {
      x: resizeBox.x + resizeBox.width / 2,
      y: resizeBox.y + resizeBox.height / 2 + 28,
    },
  );
  expect((await resized).status()).toBe(200);
  const afterResize = await stored(page, task.id);
  expect(afterResize.schedule?.endAt).toBe(
    calendarWallToInstant(`${date}T11:00`, me.user.tz),
  );
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  await safeBox(event);
  const cancelResizeBox = await resizeHandle.boundingBox();
  if (!cancelResizeBox) throw new Error("Missing resize cancellation handle");
  page.on("request", countWrites);
  await touchGesture(
    page,
    {
      x: cancelResizeBox.x + cancelResizeBox.width / 2,
      y: cancelResizeBox.y + cancelResizeBox.height / 2,
    },
    {
      x: cancelResizeBox.x + cancelResizeBox.width / 2,
      y: cancelResizeBox.y + cancelResizeBox.height / 2 + 28,
    },
    true,
  );
  await expect(page.locator(".is-event-copy")).toHaveCount(0);
  await expect(page.locator(".sx__is-resizing")).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(writes).toHaveLength(0);
  page.off("request", countWrites);
  expect((await stored(page, task.id)).task.version).toBe(
    afterResize.task.version,
  );
  expect((await stored(page, task.id)).schedule?.endAt).toBe(
    afterResize.schedule?.endAt,
  );
  await page.getByTestId("calendar-week").click();
  await expect(page.locator(".sx__week-grid__date")).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByTestId("calendar-month-grid").click();
  const monthEvent = page
    .locator(".sx__month-grid-event")
    .filter({ hasText: task.title })
    .first();
  await expect(
    page.locator(".sx__month-grid-event").filter({ hasText: task.title }),
  ).toHaveCount(4);
  await monthEvent.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  let source = await monthEvent.boundingBox();
  const nextDate = offsetDay(date, 1);
  const target = page.locator(`.sx__month-grid-day[data-date="${nextDate}"]`);
  await target.scrollIntoViewIfNeeded();
  const destination = await target.boundingBox();
  source = await monthEvent.boundingBox();
  if (!source || !destination) throw new Error("Missing month move geometry");
  const monthMoved = patchAck(page, task.id);
  await touchGesture(
    page,
    { x: source.x + 12, y: source.y + 10 },
    {
      x: destination.x + destination.width / 2,
      y: destination.y + destination.height / 2,
    },
  );
  expect((await monthMoved).status()).toBe(200);
  expect((await stored(page, task.id)).schedule?.startAt).toBe(
    calendarWallToInstant(`${nextDate}T09:30`, me.user.tz),
  );
  expect((await stored(page, task.id)).task.dueAt).toBe(deadline);
  await page.getByTestId("calendar-day").click();
  const surface = page.locator(".sx__time-grid-day");
  await expect(surface).toBeVisible();
  await page.locator(".sx__view-container").evaluate(async (element) => {
    element.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.locator(".sx__view-container").evaluate((element) => {
    element.scrollTop = 11 * 56;
  });
  const grid = await surface.boundingBox();
  if (!grid) throw new Error("Missing empty slot");
  const point = { x: grid.x + 20, y: grid.y + 13 * 56 + 2 };
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest(".sx__time-grid-day")
          ?.className,
      point,
    ),
  ).toContain("sx__time-grid-day");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("schedule-start")).toHaveValue(`${date}T13:00`);
  const title = `Empty slot ${locale}`;
  await page.getByTestId("schedule-title").fill(title);
  const taskAck = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/tasks",
  );
  await page.getByTestId("schedule-save").click();
  const response = await taskAck;
  expect(response.status()).toBe(201);
  const newTask = taskSchema.parse(await response.json());
  expect((await stored(page, newTask.id)).schedule?.startAt).toBe(
    calendarWallToInstant(`${date}T13:00`, me.user.tz),
  );
  expect((await stored(page, newTask.id)).task.dueAt).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("calendar-list").click();
  await expect(
    page.locator(".calendar-list-item").filter({ hasText: title }),
  ).toHaveCount(1);
  const listNext = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/calendar" &&
      Date.parse(new URL(response.url()).searchParams.get("from") ?? "") ===
        Date.parse(calendarWallToInstant(`${nextDate}T00:00`, me.user.tz)),
  );
  await page.getByTestId("calendar-next").click();
  expect((await listNext).status()).toBe(200);
  await expect(
    page.locator(".calendar-list-item").filter({ hasText: title }),
  ).toHaveCount(0);
  await page.getByTestId("calendar-previous").click();
  await expect(
    page.locator(".calendar-list-item").filter({ hasText: title }),
  ).toHaveCount(1);
  await page.getByTestId("calendar-list").click();
  const createdEvent = page
    .locator(".sx__time-grid-event")
    .filter({ hasText: title })
    .first();
  await createdEvent.focus();
  await createdEvent.press("Enter");
  await expect(page.getByTestId("schedule-clear")).toBeEnabled();
  const clearingBodies: unknown[] = [];
  const recordClear = (request: import("@playwright/test").Request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/tasks/${newTask.id}/calendar`
    )
      clearingBodies.push(request.postDataJSON());
  };
  page.on("request", recordClear);
  const cleared = patchAck(page, newTask.id);
  await page.getByTestId("schedule-clear").click();
  expect((await cleared).status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId(`schedule-task-${newTask.id}`)).toBeVisible();
  expect(clearingBodies).toEqual([
    { version: newTask.version, schedule: null },
  ]);
  page.off("request", recordClear);
  expect((await stored(page, newTask.id)).schedule).toBeNull();
  await page.screenshot({
    path: `/tmp/taff-m6-${locale}-phone.png`,
    fullPage: true,
  });
});
