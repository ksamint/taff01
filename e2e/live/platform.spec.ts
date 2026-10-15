import { chromium, expect } from "@playwright/test";
import { messages } from "../support/messages";
import { closeTaskField, openTaskField } from "../support/task-fields";
import {
  inviteRecipient,
  liveSignIn,
  runLabel,
  selectVerificationWorkspace,
  test,
} from "./live";

test("Platform HTTPS, health, cookies, origin rejection, navigation and zh-CN spot checks", async ({
  page,
  context,
}, info) => {
  const locale = info.project.metadata.locale as keyof typeof messages;
  await page.goto("/");
  expect(new URL(page.url()).origin).toBe("https://taff.apuch.cn");
  await expect(page.getByTestId("auth-email")).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });
  const methods = await page.request.get("/api/auth/methods");
  expect(methods.status()).toBe(200);
  if (!process.env.TAFF_AUTH_METHODS_BASELINE)
    throw new Error(
      "BLOCKED: pre-upgrade auth-method baseline receipt required",
    );
  expect(await methods.json()).toEqual(
    JSON.parse(process.env.TAFF_AUTH_METHODS_BASELINE),
  );
  await liveSignIn(page, locale);
  const cookies = await context.cookies();
  const sessions = cookies.filter((c) =>
    c.name.includes("better-auth.session_token"),
  );
  expect(sessions.length).toBeGreaterThan(0);
  for (const cookie of sessions) {
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
  }
  const rejected = await page.request.patch("/api/profile", {
    headers: { Origin: "https://foreign.invalid" },
    data: { locale: "en" },
  });
  expect(rejected.status()).toBe(403);
  if (info.project.metadata.formFactor === "phone") {
    await expect(page.locator(".tabbar")).toBeVisible();
    await expect(page.locator(".tabbar a")).toHaveCount(4);
  } else await expect(page.getByTestId("sidebar")).toBeVisible();
  const tz = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  expect(
    (
      await page.request.patch("/api/profile", {
        data: { locale: "zh-CN", tz },
      })
    ).status(),
  ).toBe(200);
  for (const path of ["/", "/projects", "/me"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      /^zh-(?:Hans-)?CN$/,
    );
    await expect(page.locator("main.content")).toBeVisible();
    if (path === "/")
      await expect(page.getByTestId("today-heading")).toHaveText(
        messages["zh-CN"].today,
      );
  }
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz } })
    ).status(),
  ).toBe(200);
});

test("Restricted verification member sees timeline and graph without finance; guest sees no CRM switch", async ({
  page,
  browser,
}, info) => {
  const { workspace } = await liveSignIn(
    page,
    info.project.metadata.locale as string,
  );
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `v0.2.0 permission ${runLabel()}` } },
  );
  expect(created.status()).toBe(201);
  const project = await created.json();
  const finance = await page.request.patch(`/api/projects/${project.id}`, {
    data: {
      version: project.version,
      contractAmount: "12345.67",
      currency: "HKD",
    },
  });
  expect(finance.status()).toBe(200);
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      ownerId: workspace.memberId,
      title: `v0.2.0 finance visibility ${runLabel()}`,
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();
  expect(
    (
      await page.request.patch(`/api/tasks/${task.id}/plan`, {
        data: {
          startDate: new Date().toISOString().slice(0, 10),
          durationDays: 2,
        },
      })
    ).status(),
  ).toBe(200);
  const adminTimeline = await page.request.get(
    `/api/projects/${project.id}/timeline`,
  );
  expect(adminTimeline.status()).toBe(200);
  expect((await adminTimeline.json()).risk.finance.contractAmount).toBe(
    "12345.67",
  );
  await page.goto(`/projects/${project.id}?view=timeline`);
  await expect(page.getByTestId("timeline-finance")).toBeVisible();
  const recipient = await inviteRecipient(browser, page, workspace.id, info);
  try {
    const memberPage =
      recipient.context.pages()[0] ?? (await recipient.context.newPage());
    await memberPage.goto("/orgs");
    await memberPage.getByTestId(`workspace-${workspace.id}`).click();
    for (const view of ["timeline", "relations"]) {
      await memberPage.goto(`/projects/${project.id}?view=${view}`);
      await expect(memberPage.locator("main.content")).toBeVisible();
      await expect(memberPage.getByTestId("timeline-finance")).toHaveCount(0);
    }
    const timeline = await recipient.context.request.get(
      `/api/projects/${project.id}/timeline`,
    );
    expect(timeline.status()).toBe(200);
    expect((await timeline.json()).risk.finance).toBeNull();
    const brief = await recipient.context.request.get("/api/brief?scope=all");
    expect(brief.status()).toBe(200);
    for (const row of (await brief.json()).projects)
      expect(row.risk.finance).toBeNull();
    const role = await page.request.patch(
      `/api/workspaces/${workspace.id}/members/${recipient.member.id}`,
      { data: { role: "guest" } },
    );
    expect(role.status()).toBe(200);
    await memberPage.goto("/projects");
    await expect(
      memberPage.locator('a[href="/companies"],a[href="/contacts"]'),
    ).toHaveCount(0);
    expect(
      (
        await recipient.context.request.get(
          `/api/companies?workspaceId=${workspace.id}`,
        )
      ).status(),
    ).toBe(403);
    const restored = await page.request.patch(
      `/api/workspaces/${workspace.id}/members/${recipient.member.id}`,
      { data: { role: "member" } },
    );
    expect(restored.status()).toBe(200);
  } finally {
    await page.request.patch(
      `/api/workspaces/${workspace.id}/members/${recipient.member.id}`,
      { data: { role: "member" } },
    );
    await recipient.context.close();
  }
});

test("Realtime task edit reaches an independently authenticated second Chromium process without reload", async ({
  page,
}, info) => {
  const locale = info.project.metadata.locale as string;
  const { workspace } = await liveSignIn(page, locale);
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `v0.2.0 two-browser realtime ${runLabel()}` } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const title = `v0.2.0 realtime ${crypto.randomUUID()}`;
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      ownerId: workspace.memberId,
      title,
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();
  // chromium.launch creates a different browser process from Playwright's fixture browser.
  const secondBrowser = await chromium.launch();
  let secondPageErrors = 0;
  try {
    const secondContext = await secondBrowser.newContext({
      baseURL: process.env.RELEASE_BASE_URL,
      viewport: page.viewportSize() ?? { width: 1280, height: 800 },
      locale: locale === "en" ? "en-US" : locale,
    });
    secondContext.on("page", (next) =>
      next.on("pageerror", () => {
        secondPageErrors++;
      }),
    );
    const observer = await secondContext.newPage();
    await liveSignIn(observer, locale);
    await page.goto(`/projects/${project.id}`);
    await observer.goto(`/projects/${project.id}`);
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      observer.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    let observerNavigations = 0;
    observer.on("framenavigated", (frame) => {
      if (frame === observer.mainFrame()) observerNavigations++;
    });
    await page.goto(`/tasks/${task.id}`);
    await openTaskField(page, "text");
    const edited = `${title} edited`;
    await page.getByTestId("edit-title").fill(edited);
    await closeTaskField(page, "text");
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tasks/${task.id}` &&
        response.request().method() === "PATCH",
    );
    await page.getByTestId("edit-save").click();
    expect((await saved).status()).toBe(200);
    await expect(
      observer.getByRole("link", { name: edited, exact: true }),
    ).toBeVisible();
    await expect(
      observer.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
    expect(
      observerNavigations,
      "observer main-frame reload/navigation count",
    ).toBe(0);
    info.annotations.push({
      type: "check",
      description:
        "ok|realtime title update between two independent Chromium processes without reload",
    });
  } finally {
    await secondBrowser.close();
    info.annotations.push({
      type: "check",
      description: `${secondPageErrors === 0 ? "ok" : "fail"}|zero pageerrors in separate Chromium process`,
    });
    expect(secondPageErrors, "separate Chromium pageerror count").toBe(0);
  }
});
