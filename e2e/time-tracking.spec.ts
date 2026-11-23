import { expect, test } from "@playwright/test";
import {
  meSchema,
  type TimeEntry,
  taskSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("logs workspace-local time and manages entries and rates from Me", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Time tracker",
      email: `time-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signup.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: "UTC" } })
    ).status(),
  ).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: "Track time on this task",
    },
  });
  expect(created.status()).toBe(201);
  const task = taskSchema.parse(await created.json());
  const today = "2026-11-24";
  const timeZone = "Asia/Tokyo";
  const note = "Prepared the project brief.";
  const editedNote = "Prepared and reviewed the brief.";
  const id = crypto.randomUUID();
  let entry: TimeEntry | null = null;
  await page.route("**/api/time-entries**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    switch (request.method()) {
      case "POST":
        expect(request.postDataJSON()).toEqual({
          taskId: task.id,
          minutes: 30,
          day: today,
          note,
        });
        entry = {
          id,
          taskId: task.id,
          workspaceId: workspace.id,
          personId: workspace.memberId,
          minutes: 30,
          day: today,
          note,
          createdAt: "2026-11-23T15:30:00.000Z",
        };
        return route.fulfill({ status: 201, json: entry });
      case "PATCH":
        expect(url.pathname).toBe(`/api/time-entries/${id}`);
        expect(request.postDataJSON()).toEqual({
          minutes: 35,
          day: today,
          note: editedNote,
        });
        expect(entry).not.toBeNull();
        entry = { ...entry!, minutes: 35, note: editedNote };
        return route.fulfill({ json: entry });
      case "DELETE":
        expect(url.pathname).toBe(`/api/time-entries/${id}`);
        entry = null;
        return route.fulfill({ status: 204 });
      default:
        expect(url.searchParams.get("workspaceId")).toBe(workspace.id);
        if (url.searchParams.has("taskId"))
          expect(url.searchParams.get("taskId")).toBe(task.id);
        return route.fulfill({
          json: { timeZone, today, entries: entry ? [entry] : [] },
        });
    }
  });
  let effectiveRate = {
    workspaceId: workspace.id,
    personId: workspace.memberId,
    currency: "USD",
    rateMicrosPerHour: 8_500_000,
    validFrom: "2026-11-23",
  };
  const futureRate = {
    ...effectiveRate,
    rateMicrosPerHour: 80_000_000,
    validFrom: "2026-11-25",
  };
  await page.route("**/api/member-rates**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      effectiveRate = {
        ...effectiveRate,
        rateMicrosPerHour: 45_125_000,
        validFrom: today,
      };
      expect(request.postDataJSON()).toEqual(effectiveRate);
      return route.fulfill({ status: 201, json: effectiveRate });
    }
    expect(new URL(request.url()).searchParams.get("workspaceId")).toBe(
      workspace.id,
    );
    return route.fulfill({ json: [futureRate, effectiveRate] });
  });

  await page.goto(`/tasks/${task.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: m.timeTracking.log }).click();
  const log = page.getByRole("dialog", { name: m.timeTracking.log });
  await expect(log.getByLabel(m.timeTracking.day)).toHaveValue(today);
  await log.getByLabel(m.timeTracking.minutes).fill("30");
  await log.getByLabel(m.timeTracking.note).fill(note);
  await log.getByRole("button", { name: m.planning.save }).click();
  await expect(log).toHaveCount(0);

  await page.goto("/me?tab=settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: m.timeTracking.title }).click();
  await expect(
    page.getByRole("heading", { name: m.timeTracking.title, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  });
  const rate = page.getByRole("region", { name: m.timeTracking.ownRate });
  await expect(rate).toContainText(format.format(8.5));

  await page.getByRole("button", { name: m.timeTracking.edit }).click();
  const edit = page.getByRole("dialog", { name: m.timeTracking.edit });
  await edit.getByLabel(m.timeTracking.minutes).fill("35");
  await edit.getByLabel(m.timeTracking.note).fill(editedNote);
  await edit.getByRole("button", { name: m.planning.save }).click();
  await expect(page.getByText(editedNote, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: m.timeTracking.remove }).click();
  await page
    .getByRole("dialog", { name: m.timeTracking.removeQuestion })
    .getByRole("button", { name: m.timeTracking.remove })
    .click();
  await expect(
    page.getByText(m.timeTracking.empty, { exact: true }),
  ).toBeVisible();

  await rate.getByRole("button", { name: m.timeTracking.setRate }).click();
  const set = page.getByRole("dialog", { name: m.timeTracking.setRate });
  await expect(set.getByLabel(m.timeTracking.person)).toHaveValue(
    workspace.memberId,
  );
  await expect(set.getByLabel(m.timeTracking.validFrom)).toHaveValue(today);
  await set.getByLabel(m.timeTracking.amount).fill("45.125");
  await set.getByLabel(m.timeTracking.currency).fill("USD");
  await set.getByRole("button", { name: m.planning.save }).click();
  await expect(rate).toContainText(format.format(45.125));
});
