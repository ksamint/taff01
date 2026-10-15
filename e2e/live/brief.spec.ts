import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, type Page } from "@playwright/test";
import {
  type Brief,
  briefSchema,
  issuedAgentTokenSchema,
  memberListSchema,
  meSchema,
  type Task,
  taskListSchema,
  taskSchema,
} from "../../packages/schemas/src/index";
import { messages, type TestLocale } from "../support/messages";
import { selectLocale } from "../support/preferences";
import { liveSignIn, runLabel, test, verificationAgent } from "./live";

// M18 brief and Ask taff: the overlay (phone) and the Me tab (desktop) show
// the server's deterministic brief, Ask answers by rules with no AI env, and
// an agent's proposal is applied or dismissed only by a person in a sheet.
test.use({ actionTimeout: 15000 });

/** i18next-style interpolation for the assertions. */
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key]));

async function signIn(page: Page, locale: TestLocale) {
  return liveSignIn(page, locale);
}

async function readBrief(page: Page): Promise<Brief> {
  const response = await page.request.get("/api/brief?scope=all");
  expect(response.status()).toBe(200);
  return briefSchema.parse(await response.json());
}

/** The brief on screen equals GET /api/brief: tiles, rows and levels. */
async function expectBriefMatches(page: Page, brief: Brief) {
  const stats = page.getByTestId("brief-stats");
  await expect(stats.getByTestId("brief-stat-dueToday")).toHaveText(
    String(brief.counts.dueToday),
  );
  await expect(stats.getByTestId("brief-stat-agents")).toHaveText(
    String(brief.counts.agentsWorking),
  );
  await expect(stats.getByTestId("brief-stat-toConfirm")).toHaveText(
    String(
      brief.counts.reviewsWaiting +
        brief.counts.pendingGrants +
        brief.counts.pendingSuggestions,
    ),
  );
  const rows = page.getByTestId("brief-risk");
  await expect(rows).toHaveCount(brief.projects.length);
  for (const [index, project] of brief.projects.slice(0, 5).entries()) {
    await expect(rows.nth(index)).toHaveAttribute(
      "data-project",
      project.projectId,
    );
    await expect(rows.nth(index)).toHaveAttribute(
      "data-level",
      project.risk.level,
    );
  }
  await expect(page.getByTestId("brief-action")).toHaveCount(
    brief.actions.length,
  );
}

async function agentClient(page: Page, workspaceId: string, agentId: string) {
  const response = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId,
      memberId: agentId,
      name: `brief e2e ${Date.now()}`,
      scopes: ["tasks:read", "tasks:write"],
    },
  });
  expect(response.status()).toBe(201);
  const issued = issuedAgentTokenSchema.parse(await response.json());
  const client = new Client({ name: "taff-e2e", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("/mcp", process.env.RELEASE_BASE_URL),
      { authProvider: { token: async () => issued.token } },
    ),
  );
  return { client, tokenId: issued.id };
}

async function propose(
  client: Client,
  taskId: string,
  kind: "split" | "reschedule",
) {
  const result = await client.callTool({
    name: "suggestions.create",
    arguments:
      kind === "split"
        ? {
            taskId,
            kind,
            payload: {
              subtasks: [{ title: "Draft copy" }, { title: "Check copy" }],
              reason: "Two people can work in parallel.",
            },
          }
        : {
            taskId,
            kind,
            payload: { startDate: "2026-11-02", durationDays: 3 },
          },
  });
  expect(result.isError).not.toBe(true);
}

test("phone brief overlay matches the API, answers by rules and restores focus", async ({
  page,
}, info) => {
  test.skip(
    info.project.metadata.formFactor !== "phone",
    "Phone-only overlay flow; desktop covered separately",
  );
  test.setTimeout(90000);
  const locale = info.project.metadata.locale as TestLocale;
  const m = messages[locale];
  const { me } = await signIn(page, locale);
  await page.goto("/me");
  const row = page.getByTestId("me-brief");
  await expect(row).toContainText(m.brief.nav);
  await row.click();
  await expect(page).toHaveURL(/\/brief$/);
  const overlay = page.getByRole("dialog", { name: m.brief.title });
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("brief-greeting")).toContainText(me.user.name);
  await expectBriefMatches(page, await readBrief(page));
  // Ask with no AI env: the rules answer, with the same items as the API.
  await page.getByTestId("ask-try-blocked").click();
  const answer = page.getByTestId("ask-answer");
  await expect(answer).toHaveAttribute("aria-live", "polite");
  await expect(answer.locator("[data-source]")).toHaveAttribute(
    "data-source",
    "rules",
  );
  await expect(answer).toContainText(m.ask.rules);
  const api = await page.request.post("/api/ask", {
    data: { question: m.ask.suggestion.blocked },
  });
  expect(api.status()).toBe(200);
  const expected = (await api.json()) as {
    intent: string;
    items: unknown[];
    source: string;
  };
  expect(expected).toMatchObject({ intent: "blocked", source: "rules" });
  await expect(page.getByTestId("ask-item")).toHaveCount(expected.items.length);
  // A question the rules cannot answer says so instead of inventing.
  await page.getByTestId("ask-input").fill("Tell me a joke");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("ask-heading")).toHaveText(
    m.ask.answer.unknown,
  );
  await expect(page.getByTestId("ask-item")).toHaveCount(0);
  // Focus stays inside the modal overlay; Escape closes it.
  await page.getByTestId("ask-input").focus();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId("me-brief")).toBeFocused();
  // A direct visit renders the overlay over 我的; the close button returns.
  await page.goto("/brief");
  await expect(overlay).toBeVisible();
  await page.getByTestId("brief-close").click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId("me-brief")).toBeVisible();
});

test("a person reviews an agent's proposal in the brief before anything changes", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.metadata.locale as TestLocale;
  const m = messages[locale];
  const { workspace } = await signIn(page, locale);
  const agent = await verificationAgent(page, workspace.id);
  const create = async (title: string): Promise<Task> => {
    const response = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        title,
        ownerId: workspace.memberId,
        workerId: agent.id,
      },
    });
    expect(response.status()).toBe(201);
    return taskSchema.parse(await response.json());
  };
  const stamp = `${locale} ${Date.now()}`;
  const splitTask = await create(`Brief split ${stamp}`);
  const moveTask = await create(`Brief move ${stamp}`);
  const { client, tokenId } = await agentClient(page, workspace.id, agent.id);
  try {
    await propose(client, splitTask.id, "split");
    await propose(client, moveTask.id, "reschedule");
  } finally {
    await client.close();
    await page.request.delete(`/api/agent-tokens/${tokenId}`);
  }
  if (info.project.metadata.formFactor === "desktop") {
    await page.goto("/me?tab=brief");
  } else {
    await page.goto("/me");
    await expect(page.getByTestId("brief-dot")).toBeVisible();
    await page.getByTestId("me-brief").click();
  }
  await expect(page.getByTestId("brief-view")).toBeVisible();
  const splitAction = page
    .getByTestId("brief-action")
    .filter({ hasText: splitTask.title });
  await expect(splitAction).toHaveAttribute("data-kind", "suggestion");
  await expect(splitAction).toContainText(
    fill(m.brief.action.split_other, {
      agent: agent.name,
      task: splitTask.title,
      count: 2,
    }),
  );
  // Opening the proposal changes nothing: it shows what applying creates.
  await splitAction.getByTestId("brief-action-open").click();
  const sheet = page.getByRole("dialog", { name: m.brief.proposal.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("brief-proposal-subtasks")).toContainText(
    "Draft copy",
  );
  await expect(sheet).toContainText("Two people can work in parallel.");
  const children = async () =>
    taskListSchema.parse(
      await (
        await page.request.get(
          `/api/tasks?workspaceId=${workspace.id}&parentId=${splitTask.id}`,
        )
      ).json(),
    );
  expect(await children()).toHaveLength(0);
  await sheet.getByTestId("brief-proposal-apply").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".toast-region")).toContainText(
    m.brief.toast.applied,
  );
  await expect
    .poll(async () => (await children()).map((task) => task.title).sort())
    .toEqual(["Check copy", "Draft copy"]);
  await expect(splitAction).toHaveCount(0);
  // Dismissing the reschedule leaves the plan as it was.
  const moveAction = page
    .getByTestId("brief-action")
    .filter({ hasText: moveTask.title });
  await moveAction.getByTestId("brief-action-open").click();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("brief-proposal-dismiss").click();
  await expect(sheet).toHaveCount(0);
  await expect(moveAction).toHaveCount(0);
  const after = taskSchema.parse(
    await (await page.request.get(`/api/tasks/${moveTask.id}`)).json(),
  );
  expect(after.dueAt).toBe(moveTask.dueAt);
});

test("desktop shows the brief as the Me tab and /brief moves there", async ({
  page,
}, info) => {
  test.skip(
    info.project.metadata.formFactor !== "desktop",
    "Desktop-only tab flow; phone covered separately",
  );
  test.setTimeout(60000);
  const locale = info.project.metadata.locale as TestLocale;
  const m = messages[locale];
  const { me } = await signIn(page, locale);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/brief");
  await expect(page).toHaveURL(/\/me\?tab=brief$/);
  const tab = page.getByTestId("me-tab-brief");
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(tab).toContainText(m.brief.nav);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByTestId("brief-greeting")).toContainText(me.user.name);
  await expectBriefMatches(page, await readBrief(page));
  await page.getByTestId("ask-try-atRisk").click();
  await expect(page.getByTestId("ask-answer")).toContainText(m.ask.rules);
  await page.getByTestId("brief-close").click();
  await expect(page.getByTestId("me-tab-inbox")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("me-tab-inbox")).toBeFocused();
  // Keyboard: the tabs move with the arrow keys.
  await page.keyboard.press("ArrowRight");
  await expect(tab).toBeFocused();
  await expect(tab).toHaveAttribute("aria-selected", "true");
});
