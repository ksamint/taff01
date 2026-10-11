import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  issuedAgentTokenSchema,
  memberSchema,
  runDetailSchema,
  runListSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

// Use the browser's tab order, never programmatic focus: unreachable controls
// or focus escaping a modal fail this bounded walk.
async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let step = 0; step < 90; step++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) > 0
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("Enter");
}
function payload(result: {
  isError?: boolean;
  content: { type: string; text?: string }[];
}) {
  expect(result.isError).not.toBe(true);
  const text = result.content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP response requires text content");
  return JSON.parse(text);
}

test("keyboard alone creates, assigns, opens and approves a task with real agent evidence", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const response = await page.request.post(
    `/api/workspaces/${workspace.id}/members`,
    { data: { name: `Keyboard agent ${crypto.randomUUID()}`, kind: "agent" } },
  );
  expect(response.status()).toBe(201);
  const agent = memberSchema.parse(await response.json());
  expect(
    (
      await page.request.put(`/api/agents/${agent.id}/permissions`, {
        data: { capability: "files.attach", decision: "allow" },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  const title = `Keyboard review ${locale} ${crypto.randomUUID()}`;
  const openQuick = page.getByTestId("open-quick");
  await activate(page, openQuick);
  await tabTo(page, page.getByTestId("quick-text"));
  await page.keyboard.insertText(title);
  await activate(page, page.getByTestId("quick-parse"));
  await expect(page.getByTestId("quick-title")).toHaveValue(title);
  const picker = page.getByTestId("quick-field-worker");
  await activate(page, picker);
  await tabTo(page, page.getByTestId("quick-worker"));
  await page.keyboard.press("Escape");
  await expect(picker).toBeFocused();
  const created = page.waitForResponse(
    (value) =>
      new URL(value.url()).pathname === "/api/tasks" &&
      value.request().method() === "POST",
  );
  await activate(page, page.getByTestId("quick-create"));
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const task = taskSchema.parse(await createdResponse.json());
  expect(task.workerId).toBeNull();
  await expect(openQuick).toBeFocused();
  const row = page.getByTestId("task-card").filter({ hasText: title });
  const assignment = row.getByTestId("assignment-select");
  await tabTo(page, assignment);
  await expect
    .poll(() =>
      assignment.evaluate(
        (element) => getComputedStyle(element.parentElement!).outlineStyle,
      ),
    )
    .not.toBe("none");
  const assigned = page.waitForResponse(
    (value) =>
      new URL(value.url()).pathname === `/api/tasks/${task.id}/assignment` &&
      value.request().method() === "PATCH",
  );
  await page.keyboard.press("End");
  const assignedResponse = await assigned;
  expect(assignedResponse.status()).toBe(200);
  expect(taskSchema.parse(await assignedResponse.json()).workerId).toBe(
    agent.id,
  );
  await activate(page, row.locator(`a[href="/tasks/${task.id}"]`));
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
  await activate(page, page.getByTestId("run-start"));
  await expect(page.getByTestId("run-status")).toHaveText(
    messages[locale].run.status.running,
  );
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "role",
    "status",
  );
  const runs = runListSchema.parse(
    await (
      await page.request.get(`/api/runs?workspaceId=${workspace.id}`)
    ).json(),
  );
  const run = runs.find((item) => item.taskId === task.id);
  if (!run) throw new Error("Started task requires its real run");
  const issued = issuedAgentTokenSchema.parse(
    await (
      await page.request.post("/api/agent-tokens", {
        data: {
          workspaceId: workspace.id,
          memberId: agent.id,
          name: "Keyboard evidence",
          scopes: ["tasks:read", "tasks:write", "inbox:review", "files:write"],
        },
      })
    ).json(),
  );
  const client = new Client({ name: "keyboard-evidence", version: "0.1.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("/mcp", process.env.API_INTERNAL_URL ?? process.env.AUTH_URL),
        { authProvider: { token: async () => issued.token } },
      ),
    );
    const get = async () =>
      runDetailSchema.parse(
        payload(
          await client.callTool({
            name: "runs.get",
            arguments: { runId: run.id },
          }),
        ),
      );
    let detail = await get();
    const tools = await client.listTools();
    payload(
      await client.callTool({
        name: "runs.event",
        arguments: {
          runId: run.id,
          version: detail.run.version,
          kind: "source",
          title: "Actual MCP discovery",
          text: `Discovered ${tools.tools.length} tools`,
          sourceUrl: new URL("/mcp", process.env.AUTH_URL).href,
        },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "files.attach",
        arguments: {
          runId: run.id,
          version: detail.run.version,
          name: "discovery.txt",
          mimeType: "text/plain",
          content: `Official MCP client discovered ${tools.tools.length} tools.`,
        },
      }),
    );
    detail = await get();
    payload(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId: run.id,
          version: detail.run.version,
          summary: "Actual MCP discovery available for review",
        },
      }),
    );
    await expect(page.getByTestId("review-artifact")).toHaveCount(1);
    await expect(page.getByTestId("review-approve")).toBeDisabled();
    await activate(page, page.getByTestId("item-approve"));
    for (const key of [
      "matchesDescription",
      "verifiable",
      "withinPermissions",
    ]) {
      const checkbox = page.getByTestId(`review-check-${key}`);
      await tabTo(page, checkbox);
      await page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
    }
    await activate(page, page.getByTestId("review-approve"));
    await expect(page.getByTestId("review-readonly")).toHaveText(
      messages[locale].review.approved,
    );
    await expect(page.getByTestId("review-readonly")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      taskSchema.parse(
        await (await page.request.get(`/api/tasks/${task.id}`)).json(),
      ).status,
    ).toBe("done");
  } finally {
    await client.close();
    await page.request.delete(`/api/agent-tokens/${issued.id}`);
  }
});
