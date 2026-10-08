import { expect, type Page, test } from "@playwright/test";
import en from "../apps/web/locales/en/common.json";
import zhCN from "../apps/web/locales/zh-CN/common.json";
import zhHK from "../apps/web/locales/zh-HK/common.json";
import {
  agentProfileSchema,
  memberListSchema,
  meSchema,
  runSchema,
  taskSchema,
} from "../packages/schemas/src/index";

const messages = { en, "zh-CN": zhCN, "zh-HK": zhHK };
type Locale = keyof typeof messages;
async function signIn(page: Page, locale: Locale) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await page.getByTestId("locale-select").selectOption(locale);
  await expect(page.getByTestId("locale-select")).toBeEnabled();
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const workspace = me.workspaces[0];
  const members = memberListSchema.parse(
    await (
      await page.request.get(`/api/members?workspaceId=${workspace.id}`)
    ).json(),
  );
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("Seed agent is required");
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: agent.id,
      title: `Rollback ${locale} ${Date.now()}`,
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  return { workspace, agent, task };
}
async function rejectLater(page: Page, path: string, method = "POST") {
  let release!: () => void;
  let arrived!: () => void;
  let completed!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const done = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const pattern = `**${path}`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) {
      await route.continue();
      return;
    }
    arrived();
    await gate;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "forbidden" }),
    });
    completed();
  });
  return {
    seen,
    reject: async () => {
      release();
      await done;
      await page.unroute(pattern);
    },
  };
}
async function failure(page: Page, locale: Locale) {
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages[locale].errors.forbidden })
      .first(),
  ).toBeVisible();
}

test("rejected run start, assignment and control restore task and run caches", async ({
  page,
}, info) => {
  const locale = info.project.name as Locale;
  const { task, agent } = await signIn(page, locale);
  await page.goto(`/tasks/${task.id}`);
  let denied = await rejectLater(
    page,
    `/api/tasks/${task.id}/assignment`,
    "PATCH",
  );
  await page.getByTestId("detail-worker").selectOption("");
  await denied.seen;
  await expect(page.getByTestId("detail-worker")).toHaveValue("");
  await denied.reject();
  await failure(page, locale);
  await expect(page.getByTestId("detail-worker")).toHaveValue(task.workerId!);
  denied = await rejectLater(page, `/api/tasks/${task.id}/runs`);
  await page.getByTestId("run-start").click();
  await denied.seen;
  await expect(page.getByTestId("run-status")).toHaveText(
    messages[locale].run.status.running,
  );
  await expect(page.getByTestId("task-status")).toHaveText(
    messages[locale].status.in_progress,
  );
  await denied.reject();
  await failure(page, locale);
  await expect(page.getByTestId("run-start")).toBeVisible();
  await expect(page.getByTestId("run-panel")).toHaveCount(0);
  await expect(page.getByTestId("task-status")).toHaveText(
    messages[locale].status.todo,
  );
  const started = await page.request.post(`/api/tasks/${task.id}/runs`, {
    data: {},
  });
  expect(started.status()).toBe(201);
  const run = runSchema.parse(await started.json());
  await page.reload();
  denied = await rejectLater(page, `/api/runs/${run.id}/control`);
  await page.getByTestId("run-pause").click();
  await denied.seen;
  await expect(page.getByTestId("run-status")).toHaveText(
    messages[locale].run.status.paused,
  );
  await denied.reject();
  await failure(page, locale);
  await expect(page.getByTestId("run-status")).toHaveText(
    messages[locale].run.status.running,
  );
  await expect(page.getByTestId("run-pause")).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.dataset.documentMarker = "same";
  });
  // A pending write continues across navigation; other mutation groups wait.
  denied = await rejectLater(page, `/api/runs/${run.id}/control`);
  await page.getByTestId("run-pause").click();
  await denied.seen;
  await page.locator(`a[href="/agents/${agent.id}"]`).first().click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-document-marker",
    "same",
  );
  await expect(page.getByTestId("permission-web.search-ask")).toBeDisabled();
  await expect(page.getByTestId("agent-save")).toBeDisabled();
  await denied.reject();
  await expect(page.getByTestId("permission-web.search-ask")).toBeEnabled();
  await page.getByRole("link", { name: task.title, exact: true }).click();
  await expect(page.getByTestId("run-status")).toHaveText(
    messages[locale].run.status.running,
  );
});

test("rejected profile, capability, grants, tokens and language changes restore state", async ({
  page,
}, info) => {
  const locale = info.project.name as Locale;
  const { workspace, agent, task } = await signIn(page, locale);
  await page.goto(`/agents/${agent.id}`);
  const before = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  let denied = await rejectLater(page, `/api/agents/${agent.id}`, "PATCH");
  const policy =
    before.reviewPolicy === "always_review" ? "ask_only" : "always_review";
  await page.getByTestId("agent-policy").selectOption(policy);
  await page.getByTestId("agent-save").click();
  await denied.seen;
  await expect(page.getByTestId("agent-policy")).toHaveValue(policy);
  await denied.reject();
  await failure(page, locale);
  await expect(page.getByTestId("agent-policy")).toHaveValue(
    before.reviewPolicy,
  );
  const original = before.permissions.find(
    (item) => item.capability === "web.search",
  )!.decision;
  const changed = original === "deny" ? "ask" : "deny";
  denied = await rejectLater(
    page,
    `/api/agents/${agent.id}/permissions`,
    "PUT",
  );
  await page.getByTestId(`permission-web.search-${changed}`).click();
  await denied.seen;
  await expect(
    page.getByTestId(`permission-web.search-${changed}`),
  ).toHaveAttribute("aria-pressed", "true");
  await denied.reject();
  await failure(page, locale);
  await expect(
    page.getByTestId(`permission-web.search-${original}`),
  ).toHaveAttribute("aria-pressed", "true");
  const reason = `Rejected grant ${Date.now()}`;
  denied = await rejectLater(page, `/api/agents/${agent.id}/grants`);
  await page.locator("#grant-task").selectOption(task.id);
  await page.locator("#grant-reason").fill(reason);
  await page
    .getByRole("button", { name: messages[locale].grants.request, exact: true })
    .click();
  await denied.seen;
  const provisional = page
    .getByTestId("grant-card")
    .filter({ hasText: reason });
  await expect(provisional).toBeVisible();
  await denied.reject();
  await failure(page, locale);
  await expect(provisional).toHaveCount(0);
  const requested = await page.request.post(`/api/agents/${agent.id}/grants`, {
    data: { capability: "web.search", taskId: task.id, reason },
  });
  expect(requested.status()).toBe(201);
  const grant = await requested.json();
  await page.reload();
  denied = await rejectLater(page, `/api/grants/${grant.id}/decision`);
  const card = page.getByTestId("grant-card").filter({ hasText: reason });
  await card.getByTestId("grant-allow").click();
  await denied.seen;
  await expect(card.getByTestId("grant-revoke")).toBeVisible();
  await denied.reject();
  await failure(page, locale);
  await expect(card.getByTestId("grant-allow")).toBeEnabled();
  await page.goto("/me/mcp");
  denied = await rejectLater(page, "/api/agent-tokens");
  const name = `Rejected token ${Date.now()}`;
  await page.getByTestId("token-name").fill(name);
  await page.getByTestId("token-submit").click();
  await denied.seen;
  const token = page.getByTestId("token-card").filter({ hasText: name });
  await expect(token).toBeVisible();
  await expect(page.getByTestId("issued-token")).toHaveCount(0);
  await denied.reject();
  await failure(page, locale);
  await expect(token).toHaveCount(0);
  await expect(page.getByTestId("issued-token")).toHaveCount(0);
  await page.goto("/");
  denied = await rejectLater(page, "/api/profile", "PATCH");
  const next = locale === "en" ? "zh-HK" : "en";
  await page.getByTestId("locale-select").selectOption(next);
  await denied.seen;
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[next].today,
  );
  await denied.reject();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages[locale].errors.profile })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale].today,
  );
  expect((await (await page.request.get("/api/me")).json()).user.locale).toBe(
    locale,
  );
  expect(
    (
      await (
        await page.request.get(`/api/agent-tokens?workspaceId=${workspace.id}`)
      ).json()
    ).some((entry: { name: string }) => entry.name === name),
  ).toBe(false);
});

test("rejected review comments, approval and Inbox snooze restore drafts and counts", async ({
  page,
}, info) => {
  const locale = info.project.name as Locale;
  const { agent, task } = await signIn(page, locale);
  const configured = await page.request.patch(`/api/agents/${agent.id}`, {
    data: {
      supervisorId: task.ownerId,
      reviewPolicy: "always_review",
      maxDurationMs: null,
      maxCostMicros: null,
    },
  });
  expect(configured.ok()).toBe(true);
  const start = await page.request.post(`/api/tasks/${task.id}/runs`, {
    data: {},
  });
  expect(start.status()).toBe(201);
  let run = runSchema.parse(await start.json());
  const artifact = await page.request.post(`/api/runs/${run.id}/artifacts`, {
    data: {
      version: run.version,
      name: "rollback.txt",
      mimeType: "text/plain",
      content: "Real review fixture",
    },
  });
  expect(artifact.status()).toBe(201);
  run = runSchema.parse(
    (await (await page.request.get(`/api/runs/${run.id}`)).json()).run,
  );
  const submitted = await page.request.post(`/api/runs/${run.id}/submit`, {
    data: { version: run.version, summary: "Review rollback fixture" },
  });
  expect(submitted.ok()).toBe(true);
  await page.goto("/inbox");
  const item = page.getByTestId("inbox-item").filter({ hasText: task.title });
  await expect(item).toBeVisible();
  const id = (
    await (
      await page.request.get(`/api/inbox?workspaceId=${task.workspaceId}`)
    ).json()
  ).items.find((entry: { title: string }) => entry.title === task.title).id;
  const badge = await page.getByTestId("inbox-badge").first().textContent();
  let denied = await rejectLater(page, `/api/inbox/${id}`, "PATCH");
  await item.getByTestId("inbox-snooze").click();
  await denied.seen;
  await expect(item).toHaveCount(0);
  await denied.reject();
  await failure(page, locale);
  await expect(item).toBeVisible();
  await expect(page.getByTestId("inbox-badge").first()).toHaveText(badge!);
  await page.goto(`/tasks/${task.id}/review`);
  const reviewItem = page.getByTestId("review-artifact");
  const comment = `Rejected comment ${Date.now()}`;
  denied = await rejectLater(page, `/api/runs/${run.id}/comments`);
  await reviewItem.getByTestId("item-comment").fill(comment);
  await reviewItem.getByTestId("item-comment-submit").click();
  await denied.seen;
  await expect(reviewItem.getByText(comment, { exact: true })).toBeVisible();
  await denied.reject();
  await failure(page, locale);
  await expect(reviewItem.getByText(comment, { exact: true })).toHaveCount(0);
  await expect(reviewItem.getByTestId("item-comment")).toHaveValue(comment);
  await reviewItem.getByTestId("item-approve").click();
  for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
    await page.getByTestId(`review-check-${key}`).check();
  denied = await rejectLater(page, `/api/runs/${run.id}/review`);
  await page.getByTestId("review-approve").click();
  await denied.seen;
  await expect(page.getByTestId("review-task-status")).toHaveText(
    messages[locale].status.done,
  );
  await expect(page.getByTestId("review-readonly")).toHaveCount(0);
  await denied.reject();
  await failure(page, locale);
  await expect(page.getByTestId("review-task-status")).toHaveText(
    messages[locale].status.needs_review,
  );
  for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
    await expect(page.getByTestId(`review-check-${key}`)).toBeChecked();
  await expect(page.getByTestId("review-approve")).toBeEnabled();
});

test("remote session revocation clears private caches and an old write cannot restore them for another account", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as Locale;
  const { task } = await signIn(page, locale);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  const denied = await rejectLater(
    page,
    `/api/tasks/${task.id}/assignment`,
    "PATCH",
  );
  await page.getByTestId("detail-worker").selectOption("");
  await denied.seen;
  const remote = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL: process.env.AUTH_URL,
  });
  try {
    const out = await remote.request.post("/api/auth/sign-out", {
      data: {},
      headers: { Origin: process.env.AUTH_URL! },
    });
    expect(out.ok()).toBe(true);
    await expect(page.getByTestId("auth-submit")).toBeVisible({
      timeout: 1000,
    });
    await page.evaluate((privateTitle) => {
      const observer = new MutationObserver(() => {
        if (
          document.querySelector('[data-testid="task-detail-heading"]')
            ?.textContent === privateTitle
        )
          document.documentElement.dataset.privateLeak = "yes";
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }, task.title);
    await page.getByTestId("auth-toggle").click();
    await page.locator("#auth-name").fill("Cache isolation teammate");
    await page
      .getByTestId("auth-email")
      .fill(`cache-${locale}-${Date.now()}@example.test`);
    await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD!);
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("auth-submit")).toHaveCount(0);
    await expect(page.getByTestId("task-detail-heading")).toHaveCount(0);
    await denied.reject();
    await page.goto("/");
    await expect(page.getByTestId("today-heading")).toBeVisible();
    // Hold the new principal's actual read so stale cache data would be exposed.
    let release!: () => void;
    let arrived!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      arrived();
      await gate;
      await route.continue();
    });
    await page.goto(`/tasks/${task.id}`);
    await seen;
    await expect(page.getByTestId("task-detail-heading")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-private-leak",
      "yes",
    );
    release();
    await expect(
      page.getByRole("alert").filter({ hasText: en.errors.forbidden }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("task-detail-heading")).toHaveCount(0);
  } finally {
    await remote.close();
  }
});
