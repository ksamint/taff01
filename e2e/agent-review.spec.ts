import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, type Page, test } from "@playwright/test";
import {
  agentProfileSchema,
  issuedAgentTokenSchema,
  memberListSchema,
  meSchema,
  runDetailSchema,
} from "../packages/schemas/src/index";
import { selectLocale } from "./support/preferences";

const labels = {
  en: {
    today: "Today",
    running: "Working",
    paused: "Paused",
    review: "Needs review",
    done: "Done",
    approved: "Approved. The task is complete.",
    changes: "Changes requested",
  },
  "zh-CN": {
    today: "今天",
    running: "工作中",
    paused: "已暂停",
    review: "待审核",
    done: "已完成",
    approved: "已批准，任务已完成。",
    changes: "已要求修改",
  },
  "zh-HK": {
    today: "今天",
    running: "工作中",
    paused: "已暫停",
    review: "待審核",
    done: "已完成",
    approved: "已批准，任務已完成。",
    changes: "已要求修改",
  },
};
type TestLocale = keyof typeof labels;

async function signIn(page: Page, locale: TestLocale) {
  if (!process.env.DEMO_PASSWORD)
    throw new Error("DEMO_PASSWORD must be set before e2e.");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  await expect(page.getByTestId("today-heading")).toHaveText(
    labels[locale].today,
  );
  const meResponse = await page.request.get("/api/me");
  const me = meSchema.parse(await meResponse.json());
  const workspace = me.workspaces[0];
  const membersResponse = await page.request.get(
    `/api/members?workspaceId=${workspace.id}`,
  );
  const members = memberListSchema.parse(await membersResponse.json());
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("Seeded workspace needs an agent.");
  return { me, workspace, agent };
}

async function agentClient(page: Page, workspaceId: string, agentId: string) {
  const response = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId,
      memberId: agentId,
      name: `review e2e ${Date.now()}`,
      scopes: ["tasks:read", "tasks:write", "inbox:review", "files:write"],
    },
  });
  expect(response.status()).toBe(201);
  const issued = issuedAgentTokenSchema.parse(await response.json());
  const client = new Client({ name: "taff-e2e", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("/mcp", process.env.API_INTERNAL_URL ?? process.env.AUTH_URL),
      { authProvider: { token: async () => issued.token } },
    ),
  );
  return { client, tokenId: issued.id };
}

function payload(result: {
  isError?: boolean;
  content: { type: string; text?: string }[];
}) {
  expect(result.isError).not.toBe(true);
  const block = result.content.find((item) => item.type === "text");
  if (!block?.text) throw new Error("MCP result needs text content.");
  return JSON.parse(block.text);
}

test("agent reports real MCP evidence and a person approves it from Inbox", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const { workspace, agent } = await signIn(page, locale);
  const title = `Review flow ${locale} ${Date.now()}`;
  await page.getByTestId("task-title").fill(title);
  await expect(page.getByTestId("task-worker")).toBeEnabled();
  await page.getByTestId("task-worker").selectOption(agent.id);
  await page.getByTestId("task-submit").click();
  await expect(page.getByTestId("task-submit")).toBeEnabled();
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
  await page.getByTestId("run-start").click();
  await expect(page.getByTestId("run-status")).toHaveText(
    labels[locale].running,
  );
  await page.getByTestId("run-pause").click();
  await expect(page.getByTestId("run-status")).toHaveText(
    labels[locale].paused,
  );
  await page.getByTestId("run-resume").click();
  await expect(page.getByTestId("run-status")).toHaveText(
    labels[locale].running,
  );
  await expect(page.getByTestId("run-pause")).toBeEnabled();
  const taskId = new URL(page.url()).pathname.split("/")[2];
  const runsResponse = await page.request.get(
    `/api/runs?workspaceId=${workspace.id}`,
  );
  const runs = (await runsResponse.json()) as { id: string; taskId: string }[];
  const runId = runs.find((run) => run.taskId === taskId)?.id;
  expect(runId).toBeTruthy();
  const { client, tokenId } = await agentClient(page, workspace.id, agent.id);
  try {
    const get = async () =>
      runDetailSchema.parse(
        payload(
          await client.callTool({ name: "runs.get", arguments: { runId } }),
        ),
      );
    let detail = await get();
    const started = performance.now();
    const tools = await client.listTools();
    payload(
      await client.callTool({
        name: "runs.event",
        arguments: {
          runId,
          version: detail.run.version,
          kind: "test",
          title: "MCP discovery check",
          text: `Discovered ${tools.tools.length} tools`,
          testStatus: "passed",
          durationMs: Math.round(performance.now() - started),
          costMicros: 0,
        },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "runs.event",
        arguments: {
          runId,
          version: detail.run.version,
          kind: "source",
          title: "Tool discovery source",
          sourceUrl: new URL("/mcp", process.env.AUTH_URL).href,
        },
      }),
    );
    detail = await get();
    const content = `<script>window.__taffInjected = true</script>\nDiscovered ${tools.tools.length} tools through the real MCP client.`;
    payload(
      await client.callTool({
        name: "files.attach",
        arguments: {
          runId,
          version: detail.run.version,
          name: "discovery.html",
          mimeType: "text/html",
          content,
          diff: "+ Verified MCP tool discovery",
          sourceUrl: new URL("/mcp", process.env.AUTH_URL).href,
        },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId,
          version: detail.run.version,
          summary: "Tool discovery verified with the official client",
        },
      }),
    );
    await page.reload();
    await expect(page.getByTestId("task-status")).toHaveText(
      labels[locale].review,
    );
    await page.goto("/inbox");
    const item = page.getByTestId("inbox-item").filter({ hasText: title });
    await expect(item).toBeVisible();
    await item.getByTestId("inbox-snooze").click();
    await expect(item).toHaveCount(0);
    const undo =
      locale === "en" ? "Undo" : locale === "zh-CN" ? "撤销" : "復原";
    await page.getByRole("button", { name: undo, exact: true }).click();
    await expect(item).toBeVisible();
    await item.getByTestId("inbox-open-review").click();
    await expect(page.getByTestId("artifact-preview")).toHaveText(content);
    await expect(page.getByTestId("artifact-diff")).toHaveText(
      "+ Verified MCP tool discovery",
    );
    expect(await page.evaluate(() => "__taffInjected" in window)).toBe(false);
    await expect(
      page.getByText("MCP discovery check", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Tool discovery source", { exact: true }).first(),
    ).toBeVisible();
    const artifact = page.getByTestId("review-artifact");
    await artifact
      .getByTestId("item-comment")
      .fill("Verified the reported discovery output.");
    await artifact.getByTestId("item-comment-submit").click();
    await expect(
      artifact.getByText("Verified the reported discovery output.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("review-approve")).toBeDisabled();
    await artifact.getByTestId("item-approve").click();
    for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
      await page.getByTestId(`review-check-${key}`).check();
    await expect(page.getByTestId("review-approve")).toBeEnabled();
    await page
      .getByTestId("review-comment")
      .fill("Please include a second verification artifact.");
    await page.getByTestId("review-request-changes").click();
    await expect(page.getByTestId("run-status")).toHaveText(
      labels[locale].changes,
    );
    await expect(page.getByTestId("review-readonly")).toBeVisible();
    detail = await get();
    payload(
      await client.callTool({
        name: "runs.control",
        arguments: { runId, version: detail.run.version, action: "resume" },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "files.attach",
        arguments: {
          runId,
          version: detail.run.version,
          name: "verification.txt",
          mimeType: "text/plain",
          content: `Tool count independently verified: ${tools.tools.length}`,
        },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId,
          version: detail.run.version,
          summary: "Included the requested verification artifact",
        },
      }),
    );
    await page.getByTestId("run-refresh").click();
    await expect(page.getByTestId("run-status")).toHaveText(
      labels[locale].review,
    );
    await expect(page.getByTestId("review-artifact")).toHaveCount(2);
    for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
      await expect(page.getByTestId(`review-check-${key}`)).not.toBeChecked();
    await expect(page.getByTestId("review-approve")).toBeDisabled();
    for (const item of await page.getByTestId("review-artifact").all())
      await item.getByTestId("item-approve").click();
    for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
      await page.getByTestId(`review-check-${key}`).check();
    await expect(page.getByTestId("review-approve")).toBeEnabled();
    await page.getByTestId("review-approve").click();
    await expect(page.getByTestId("review-task-status")).toHaveText(
      labels[locale].done,
    );
    await expect(page.getByTestId("review-readonly")).toHaveText(
      labels[locale].approved,
    );
    await page.screenshot({
      path: `/tmp/taff-m3-review-${locale}.png`,
      fullPage: true,
    });
    await page.goto("/inbox");
    await expect(
      page.getByTestId("inbox-item").filter({ hasText: title }),
    ).toHaveCount(0);
    const result = await page.request.get(`/api/tasks/${taskId}`);
    expect((await result.json()).status).toBe("done");
  } finally {
    await client.close();
    await page.request.delete(`/api/agent-tokens/${tokenId}`);
  }
});

test("agent permission settings persist, Inbox grants expire, and cancel supports the keyboard", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const { workspace, agent } = await signIn(page, locale);
  await page.goto(`/agents/${agent.id}`);
  await expect(page.getByTestId("agent-profile-heading")).toHaveText(
    agent.name,
  );
  await page.getByTestId("permission-web.search-ask").click();
  await expect(page.getByTestId("permission-web.search-ask")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("agent-policy").selectOption("always_review");
  await page.getByTestId("agent-supervisor").selectOption(workspace.memberId);
  await page.getByTestId("agent-save").click();
  await expect(page.getByTestId("agent-save")).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId("agent-policy")).toHaveValue("always_review");
  await expect(page.getByTestId("agent-supervisor")).toHaveValue(
    workspace.memberId,
  );
  const profile = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  expect(profile.history.length).toBeGreaterThan(0);
  await page.screenshot({
    path: `/tmp/taff-m3-profile-${locale}.png`,
    fullPage: true,
  });
  const created = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      title: `Cancel flow ${locale} ${Date.now()}`,
      ownerId: workspace.memberId,
      workerId: agent.id,
    },
  });
  expect(created.status()).toBe(201);
  const task = (await created.json()) as { id: string };
  await page.goto(`/tasks/${task.id}`);
  await page.getByTestId("run-start").click();
  await expect(page.getByTestId("run-status")).toHaveText(
    labels[locale].running,
  );
  const reason = `Web access ${locale} ${Date.now()}`;
  const grantResponse = await page.request.post(
    `/api/agents/${agent.id}/grants`,
    { data: { capability: "web.search", taskId: task.id, reason } },
  );
  expect(grantResponse.status()).toBe(201);
  const grant = (await grantResponse.json()) as { id: string };
  await page.goto("/inbox");
  await page.getByTestId("inbox-tab-blockers").click();
  const blocker = page.getByTestId("inbox-item").filter({ hasText: reason });
  await expect(blocker).toHaveAttribute("data-kind", "blocker");
  await blocker.getByTestId("inbox-grant-access").click();
  const grantCard = page.getByTestId("grant-card").filter({ hasText: reason });
  await expect(grantCard).toBeVisible();
  await grantCard
    .locator(`select[id="grant-expiry-${grant.id}"]`)
    .selectOption("1");
  await grantCard.getByTestId("grant-allow").click();
  await expect(grantCard.getByTestId("grant-revoke")).toBeEnabled();
  const updatedProfile = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  const allowed = updatedProfile.grants.find((entry) => entry.id === grant.id);
  expect(allowed?.status).toBe("allowed");
  expect(Date.parse(allowed?.expiresAt ?? "") - Date.now()).toBeGreaterThan(
    55 * 60_000,
  );
  expect(Date.parse(allowed?.expiresAt ?? "") - Date.now()).toBeLessThan(
    65 * 60_000,
  );
  await grantCard.getByTestId("grant-revoke").click();
  await expect(grantCard.getByTestId("grant-revoke")).toHaveCount(0);
  await page.goto("/inbox");
  await expect(
    page.getByTestId("inbox-item").filter({ hasText: reason }),
  ).toHaveCount(0);
  await page.goto(`/tasks/${task.id}`);
  await page.getByTestId("run-cancel").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("run-cancel")).toBeFocused();
  await page.getByTestId("run-cancel").click();
  const cancel =
    locale === "en"
      ? "Cancel run"
      : locale === "zh-CN"
        ? "取消执行"
        : "取消執行";
  await page
    .getByRole("dialog")
    .getByRole("button", { name: cancel, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const canceled =
    locale === "en" ? "Canceled" : locale === "zh-CN" ? "已取消" : "已取消";
  await expect(page.getByTestId("run-status")).toHaveText(canceled);
});
