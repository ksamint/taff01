import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import {
  calendarWallToInstant,
  dailyDigestSchema,
  inboxSchema,
  issuedAgentTokenSchema,
  notificationPreferencesSchema,
  runDetailSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { agentWorkspace } from "./support/agent-workspace";

test.use({ actionTimeout: 15000 });
test("notification preferences save optimistically roll back failure and muted blockers still reach Inbox", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const { workspace, agent } = await agentWorkspace(page, browser, me);
  await page.goto("/me/notifications");
  await expect(
    page.getByRole("heading", { name: messages[locale].notifications.title }),
  ).toBeVisible();
  const patch = () =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/me/notifications" &&
        response.request().method() === "PATCH",
    );
  let saved = patch();
  await page.getByTestId("notification-review").click();
  await expect(page.getByTestId("notification-review")).not.toBeChecked();
  expect((await saved).status()).toBe(200);
  saved = patch();
  await page.getByTestId("notification-time-18:00").click();
  await expect(page.getByTestId("notification-time-18:00")).toBeChecked();
  expect((await saved).status()).toBe(200);
  saved = patch();
  await page.getByTestId("notification-quiet").click();
  await expect(page.getByTestId("notification-quiet")).toBeChecked();
  expect((await saved).status()).toBe(200);
  const actual = notificationPreferencesSchema.parse(
    await (await page.request.get("/api/me/notifications")).json(),
  );
  expect(actual).toMatchObject({
    review: false,
    digestAt: "18:00",
    quiet: true,
    block: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me/notifications", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    await gate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  await page.getByTestId("notification-block").click();
  await expect(page.getByTestId("notification-block")).not.toBeChecked();
  await expect(page.getByTestId("notification-block")).not.toBeChecked();
  await expect(page.getByTestId("notification-review")).toBeDisabled();
  release();
  await expect(page.getByTestId("notification-block")).toBeChecked();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages[locale].errors.forbidden }),
  ).toBeVisible();
  await page.unroute("**/api/me/notifications");
  expect(
    (
      await page.request.put(`/api/agents/${agent.id}/permissions`, {
        data: { capability: "web.search", decision: "ask" },
      })
    ).status(),
  ).toBe(200);
  const task = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: agent.id,
          title: `Blocker task ${locale}`,
        },
      })
    ).json(),
  );
  const reason = `Actual foreground blocker ${locale}`;
  expect(
    (
      await page.request.post(`/api/agents/${agent.id}/grants`, {
        data: { capability: "web.search", taskId: task.id, reason },
      })
    ).status(),
  ).toBe(201);
  const alert = page
    .getByTestId("foreground-notification")
    .filter({ hasText: reason });
  await expect(alert).toBeVisible({ timeout: 1500 });
  await alert
    .getByRole("button", { name: messages[locale].planning.close })
    .click();
  saved = patch();
  await page.getByTestId("notification-block").click();
  await expect(page.getByTestId("notification-block")).not.toBeChecked();
  expect((await saved).status()).toBe(200);
  const otherTask = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: agent.id,
          title: `Muted blocker task ${locale}`,
        },
      })
    ).json(),
  );
  const muted = `Muted durable blocker ${locale}`;
  const inboxRead = page.waitForResponse(
    async (response) =>
      new URL(response.url()).pathname === "/api/inbox" &&
      response.status() === 200 &&
      inboxSchema
        .parse(await response.json())
        .items.some((item) => item.title.includes(muted)),
  );
  expect(
    (
      await page.request.post(`/api/agents/${agent.id}/grants`, {
        data: { capability: "web.search", taskId: otherTask.id, reason: muted },
      })
    ).status(),
  ).toBe(201);
  await inboxRead;
  await expect(page.getByTestId("foreground-notification")).toHaveCount(0);
  await page.goto("/inbox");
  await expect(
    page.getByTestId("inbox-item").filter({ hasText: muted }),
  ).toBeVisible();
  await page.goto("/me/notifications");
  await expect(page.getByTestId("notification-review")).not.toBeChecked();
  await expect(page.getByTestId("notification-time-18:00")).toBeChecked();
  await page.screenshot({
    path: `/tmp/taff-m7-${locale}-notifications.png`,
    fullPage: true,
  });
});

test("real worker digest opens from Inbox with immutable due review and measured agent snapshot", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const { workspace, agent } = await agentWorkspace(page, browser, me);
  const future = new Date(Date.now() + 36 * 3600000);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: me.user.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(future);
  const deadline = calendarWallToInstant(`${day}T12:00`, me.user.tz);
  const due = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Digest due ${locale}`,
          dueAt: deadline,
        },
      })
    ).json(),
  );
  const task = taskSchema.parse(
    await (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: agent.id,
          title: `<img src=x onerror="window.digestUnsafe=true"> Digest agent ${locale}`,
        },
      })
    ).json(),
  );
  expect(
    (
      await page.request.patch(`/api/agents/${agent.id}`, {
        data: {
          supervisorId: workspace.memberId,
          reviewPolicy: "always_review",
          maxDurationMs: null,
          maxCostMicros: null,
        },
      })
    ).status(),
  ).toBe(200);
  const start = await page.request.post(`/api/tasks/${task.id}/runs`, {
    data: {},
  });
  expect(start.status()).toBe(201);
  const run = (await start.json()) as { id: string };
  const issued = issuedAgentTokenSchema.parse(
    await (
      await page.request.post("/api/agent-tokens", {
        data: {
          workspaceId: workspace.id,
          memberId: agent.id,
          name: "M7 digest evidence",
          scopes: ["tasks:read", "tasks:write", "inbox:review", "files:write"],
        },
      })
    ).json(),
  );
  const client = new Client({ name: "taff-m7-browser", version: "0.1.0" });
  const result = (value: {
    isError?: boolean;
    content: { type: string; text?: string }[];
  }) => {
    expect(value.isError).not.toBe(true);
    const text = value.content.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("Real MCP result required");
    return JSON.parse(text);
  };
  let measuredDuration = 0;
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("/mcp", process.env.API_INTERNAL_URL ?? process.env.AUTH_URL),
        { authProvider: { token: async () => issued.token } },
      ),
    );
    const detail = async () =>
      runDetailSchema.parse(
        result(
          await client.callTool({
            name: "runs.get",
            arguments: { runId: run.id },
          }),
        ),
      );
    let current = await detail();
    const started = performance.now();
    const tools = await client.listTools();
    measuredDuration = Math.round(performance.now() - started);
    result(
      await client.callTool({
        name: "runs.event",
        arguments: {
          runId: run.id,
          version: current.run.version,
          kind: "test",
          title: "Real MCP discovery",
          text: `${tools.tools.length} tools`,
          testStatus: "passed",
          durationMs: measuredDuration,
          costMicros: 0,
        },
      }),
    );
    current = await detail();
    result(
      await client.callTool({
        name: "files.attach",
        arguments: {
          runId: run.id,
          version: current.run.version,
          name: "discovery.txt",
          mimeType: "text/plain",
          content:
            "Private evidence must not appear in a digest or IndexedDB snapshot.",
          diff: "+ Real tool discovery",
        },
      }),
    );
    current = await detail();
    result(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId: run.id,
          version: current.run.version,
          summary: "Verified real tool discovery",
        },
      }),
    );
  } finally {
    await client.close();
  }
  await page.goto("/inbox");
  await expect(
    page.getByTestId("inbox-item").filter({ hasText: task.title }),
  ).toBeVisible();
  const generated = await promisify(execFile)(process.execPath, [
    "node_modules/tsx/dist/cli.mjs",
    "e2e/support/generate-digest.mts",
    me.user.id,
    workspace.id,
    future.toISOString(),
  ]);
  const { digestId } = JSON.parse(generated.stdout) as { digestId: string };
  if (!digestId) throw new Error("Persisted workspace digest required");
  const snapshot = dailyDigestSchema.parse(
    await (await page.request.get(`/api/digests/${digestId}`)).json(),
  );
  expect(
    snapshot.snapshot.reviews.items.some((item) => item.taskId === task.id),
  ).toBe(true);
  expect(
    snapshot.snapshot.dueToday.items.some((item) => item.taskId === due.id),
  ).toBe(true);
  expect(
    snapshot.snapshot.agents.items.find((item) => item.runId === run.id),
  ).toMatchObject({
    eventCount: 1,
    durationMs: measuredDuration,
    costMicros: 0,
  });
  await page.getByTestId("inbox-open-digest").click();
  const article = page.getByTestId("daily-digest");
  await expect(
    article.getByRole("link", { name: due.title, exact: true }),
  ).toBeVisible();
  await expect(
    article.getByRole("link", { name: task.title, exact: true }),
  ).toHaveCount(2);
  await expect(article).not.toContainText("Private evidence must not appear");
  expect(
    await page.evaluate(
      () => (window as Window & { digestUnsafe?: boolean }).digestUnsafe,
    ),
  ).toBeUndefined();
  const edit = await page.request.patch(`/api/tasks/${due.id}`, {
    data: { version: due.version, title: `${due.title} changed later` },
  });
  expect(edit.status()).toBe(200);
  await page.reload();
  await expect(
    page
      .getByTestId("daily-digest")
      .getByRole("link", { name: due.title, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/taff-m7-${locale}-digest.png`,
    fullPage: true,
  });
  await page.goto("/digests");
  await expect(page.locator(`a[href="/digests/${digestId}"]`)).toBeVisible();
  expect(
    (await page.request.delete(`/api/agent-tokens/${issued.id}`)).status(),
  ).toBe(200);
});
