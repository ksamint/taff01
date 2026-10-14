// R1 release checklist: plan §6.0, one self-contained test per item. Every
// test signs up its own fresh account on RELEASE_BASE_URL, so it never touches
// other people's data, and asserts nothing that depends on the clock or on
// seeded counts. Tokens and passwords are never printed: only the token's
// `taff_` prefix is asserted, and the report redacts both.
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, type Page, test } from "@playwright/test";
import {
  ROUND_TRIP_SCOPES,
  runMcpRoundTrip,
} from "../../apps/api/scripts/mcp-round-trip";
import {
  agentProfileSchema,
  authMethodsSchema,
  calendarWallToInstant,
  grantSchema,
  issuedAgentTokenSchema,
  notificationPreferencesSchema,
  projectSchema,
  runDetailSchema,
  taskCalendarSchema,
  taskSchema,
  workspaceSchema,
} from "../../packages/schemas/src/index";
import {
  closeFieldSheet,
  closeTaskField,
  openTaskField,
} from "../support/task-fields";
import {
  addAgentViaTeam,
  baseURL,
  demo,
  freshSignedIn,
  httpHuman,
  listMembers,
  meta,
  newAccount,
  openMeSettings,
  rateLimit,
  readMe,
  recordCheck,
  saveLocale,
  secondPerson,
  skipStep,
  unique,
  waitForApi,
} from "./support";

/** Submits the sign-in form, waiting out Better Auth's per-client limit. */
async function submitAuth(page: Page, endpoint: string) {
  for (let attempt = 0; ; attempt++) {
    const response = waitForApi(page, "POST", endpoint);
    await page.getByTestId("auth-submit").click();
    const status = (await response).status();
    if (status !== 429 || attempt >= 5) {
      expect(status, `auth via ${endpoint}`).toBe(200);
      break;
    }
    await page.waitForTimeout(10_000);
  }
  await expect(page.getByTestId("today-heading")).toBeVisible();
}

async function formSignIn(page: Page, identifier: string, password: string) {
  await page.getByTestId("auth-email").fill(identifier);
  await page.getByTestId("auth-password").fill(password);
  await submitAuth(
    page,
    identifier.includes("@")
      ? "/api/auth/sign-in/email"
      : "/api/auth/sign-in/username",
  );
}

const htmlLang = {
  en: /^en/,
  "zh-HK": /^zh-(?:Hant-)?HK$/,
  "zh-CN": /^zh-(?:Hans-)?CN$/,
};

async function signOut(page: Page, desktop: boolean, label: string) {
  await openMeSettings(page, desktop);
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByTestId("auth-submit")).toBeVisible();
}

test("[item 1] Sign-in and preferences", async ({ page, browser }, info) => {
  const { locale, m, desktop } = meta(info);
  await page
    .context()
    .addCookies([{ name: "taff-locale", value: locale, url: baseURL }]);
  await page.goto("/");
  await expect(page.getByTestId("auth-email")).toBeVisible();
  // Sign up with a username through the form.
  const account = newAccount("signup", true);
  await page.getByTestId("auth-toggle").click();
  await page.locator("#auth-name").fill(account.name);
  await page.getByTestId("auth-email").fill(account.email);
  await page.getByTestId("auth-username").fill(account.username!);
  await page.getByTestId("auth-password").fill(account.password);
  await submitAuth(page, "/api/auth/sign-up/email");
  await saveLocale(page, locale);
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  // Sign out, then sign in by email and by username.
  await signOut(page, desktop, m.signOut);
  await formSignIn(page, account.email, account.password);
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  await signOut(page, desktop, m.signOut);
  await formSignIn(page, account.username!, account.password);
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  // SMS only where the server offers it; no real code is ever requested.
  const methods = authMethodsSchema.parse(
    await (await page.request.get("/api/auth/methods")).json(),
  );
  if (methods.smsEnabled) {
    const signedOut = await browser.newContext({
      baseURL,
      locale: locale === "en" ? "en-US" : locale,
    });
    try {
      const sms = await signedOut.newPage();
      await sms.goto("/");
      await sms.getByRole("button", { name: m.sms.title, exact: true }).click();
      await expect(sms.locator("#sms-phone")).toBeVisible();
      skipStep(
        info,
        "SMS sign-in: the method is offered and its form opens; completing it needs a real phone and code, which the checklist never sends",
      );
    } finally {
      await signedOut.close();
    }
  } else
    skipStep(info, "SMS sign-in: /api/auth/methods reports smsEnabled=false");
  // The provided demo or verification account signs in too.
  if (demo) {
    const other = await browser.newContext({ baseURL });
    try {
      const demoPage = await other.newPage();
      await demoPage.goto("/");
      await formSignIn(demoPage, demo.email, demo.password);
    } finally {
      await other.close();
    }
  }
  // Language: all three, each saved to the profile, then back.
  await openMeSettings(page, desktop);
  const buttons = page.getByTestId("locale-select").getByRole("button");
  await expect(buttons).toHaveCount(3);
  for (const [index, value] of (["en", "zh-HK", "zh-CN"] as const).entries()) {
    const button = buttons.nth(index);
    if ((await button.getAttribute("aria-pressed")) !== "true") {
      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/profile" &&
          response.request().method() === "PATCH" &&
          response.request().postDataJSON()?.locale === value,
      );
      await button.click();
      expect((await saved).status()).toBe(200);
    }
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("lang", htmlLang[value]);
    expect((await readMe(page.request)).user.locale).toBe(value);
  }
  await saveLocale(page, locale);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", htmlLang[locale]);
  // Theme: dark persists across a reload, then light.
  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByTestId("theme-dark")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("[item 2] Tasks", async ({ page, browser }, info) => {
  const { m, desktop } = meta(info);
  const { workspace } = await freshSignedIn(page, info, "tasks");
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `R1 project ${unique()}` } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  const second = await secondPerson(
    browser,
    page,
    workspace.id,
    info,
    "owner change",
  );
  try {
    // Create from the FAB / quick add (phone) or 新建任務 (desktop).
    await page.goto("/");
    await expect(page.getByTestId("today-heading")).toHaveText(m.today);
    const opener = page.getByTestId(
      desktop ? "desktop-new-task" : "open-quick",
    );
    await expect(opener).toBeVisible();
    await opener.click();
    await expect(page.getByTestId("quick-title")).toBeEnabled();
    const title = `R1 task ${unique()}`;
    if (desktop) await page.getByTestId("quick-title").fill(title);
    else {
      // Phone quick add parses free text into editable fields.
      await page.getByTestId("quick-text").fill(`${title} +release`);
      await page.getByTestId("quick-parse").click();
      await expect(page.getByTestId("quick-title")).toHaveValue(title);
    }
    const created = waitForApi(page, "POST", "/api/tasks");
    await page.getByTestId("quick-create").click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const task = taskSchema.parse(await createdResponse.json());
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByTestId("task-card").filter({ hasText: title }),
    ).toBeVisible();
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
    // Desktop edits owner, priority and project inline; phone uses sheets.
    if (desktop) {
      if (second) {
        const owner = waitForApi(page, "PATCH", `/api/tasks/${task.id}`);
        await page.getByTestId("detail-owner").selectOption(second.member.id);
        expect((await owner).status()).toBe(200);
      }
      const priority = waitForApi(page, "PATCH", `/api/tasks/${task.id}`);
      await page.getByTestId("detail-priority").selectOption("1");
      expect((await priority).status()).toBe(200);
      const moved = waitForApi(page, "PATCH", `/api/tasks/${task.id}`);
      await page.getByTestId("detail-project").selectOption(project.id);
      expect((await moved).status()).toBe(200);
    } else {
      if (second) {
        await openTaskField(page, "owner");
        await page.getByTestId("edit-owner").selectOption(second.member.id);
        await closeTaskField(page, "owner");
      }
      await openTaskField(page, "priority");
      await page.getByTestId("edit-priority").selectOption("1");
      await closeTaskField(page, "priority");
      await openTaskField(page, "project");
      await page.getByTestId("edit-project").selectOption(project.id);
      await closeTaskField(page, "project");
    }
    const editedTitle = `${title} edited`;
    await openTaskField(page, "text");
    await page.getByTestId("edit-title").fill(editedTitle);
    await closeTaskField(page, "text");
    const due = new Date(Date.now() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await openTaskField(page, "due");
    await page.getByTestId("edit-date").fill(due);
    await page.getByTestId("edit-time").fill("09:45");
    await closeTaskField(page, "due");
    await openTaskField(page, "labels");
    await page.getByTestId("edit-labels").fill("release, r1");
    await closeTaskField(page, "labels");
    const saved = waitForApi(page, "PATCH", `/api/tasks/${task.id}`);
    await page.getByTestId("edit-save").click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByTestId("task-detail-heading")).toHaveText(
      editedTitle,
    );
    await expect(page.getByTestId("edit-save")).toHaveCount(0);
    const stored = taskSchema.parse(
      await (await page.request.get(`/api/tasks/${task.id}`)).json(),
    );
    expect(stored.title).toBe(editedTitle);
    expect(stored.priority).toBe(1);
    expect(stored.projectId).toBe(project.id);
    expect(stored.labels).toEqual(["release", "r1"]);
    expect(stored.dueAt).not.toBeNull();
    if (second) expect(stored.ownerId).toBe(second.member.id);
    // Subtask and comment.
    const childTitle = `R1 subtask ${unique()}`;
    await page.getByTestId("subtask-title").fill(childTitle);
    const child = waitForApi(page, "POST", "/api/tasks");
    await page.getByTestId("subtask-submit").click();
    const childTask = taskSchema.parse(await (await child).json());
    expect(childTask.parentId).toBe(task.id);
    await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
    const comment = `R1 comment ${unique()}`;
    await page.getByTestId("task-comment").fill(comment);
    const commented = waitForApi(
      page,
      "POST",
      `/api/tasks/${task.id}/comments`,
    );
    await page.getByTestId("task-comment-submit").click();
    expect((await commented).status()).toBe(201);
    await expect(page.locator("p").filter({ hasText: comment })).toBeVisible();
    await page.reload();
    await expect(page.locator("p").filter({ hasText: comment })).toBeVisible();
    await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
  } finally {
    await second?.context.close();
  }
});

/** Picks a worker on the task screen: inline on desktop, a sheet on phone. */
async function chooseWorker(
  page: Page,
  desktop: boolean,
  taskId: string,
  workerId: string,
) {
  if (!desktop) await page.getByTestId("task-field-worker").click();
  const assigned = page.waitForResponse(
    (response) =>
      response.request().method() !== "GET" &&
      new URL(response.url()).pathname.startsWith(`/api/tasks/${taskId}`),
  );
  await page.getByTestId("detail-worker").selectOption(workerId);
  expect((await assigned).status()).toBeLessThan(300);
  await expect
    .poll(
      async () =>
        taskSchema.parse(
          await (await page.request.get(`/api/tasks/${taskId}`)).json(),
        ).workerId,
    )
    .toBe(workerId);
  if (!desktop) await expect(page.getByTestId("detail-worker")).toHaveCount(0);
}

/** An MCP client acting as `agentId` with a fresh token (never printed). */
async function agentClient(page: Page, workspaceId: string, agentId: string) {
  const response = await page.request.post("/api/agent-tokens", {
    data: {
      workspaceId,
      memberId: agentId,
      name: `R1 review ${unique()}`,
      scopes: [...ROUND_TRIP_SCOPES],
    },
  });
  expect(response.status()).toBe(201);
  const issued = issuedAgentTokenSchema.parse(await response.json());
  expect(issued.token.startsWith("taff_")).toBe(true);
  const client = new Client({ name: "taff-release", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
      authProvider: { token: async () => issued.token },
    }),
  );
  return { client, tokenId: issued.id };
}

function payload(result: { isError?: boolean; content: unknown }) {
  const content = result.content as { type: string; text?: string }[];
  const block = content.find((item) => item.type === "text");
  expect(result.isError, `MCP error: ${block?.text?.slice(0, 80)}`).not.toBe(
    true,
  );
  return JSON.parse(block?.text ?? "null") as Record<string, unknown>;
}

test("[item 3] Agents and review", async ({ page }, info) => {
  const { m, desktop } = meta(info);
  const { workspace } = await freshSignedIn(page, info, "agents");
  const agent = await addAgentViaTeam(page, workspace.id);
  const createTask = async (title: string) => {
    const response = await page.request.post("/api/tasks", {
      data: { workspaceId: workspace.id, title, ownerId: workspace.memberId },
    });
    expect(response.status()).toBe(201);
    return taskSchema.parse(await response.json());
  };
  // Assign to a person, then to the agent, and run it.
  const title = `R1 review ${unique()}`;
  const task = await createTask(title);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
  await chooseWorker(page, desktop, task.id, workspace.memberId);
  await chooseWorker(page, desktop, task.id, agent.id);
  const status = page.getByTestId("run-status");
  await page.getByTestId("run-start").click();
  await expect(status).toHaveText(m.run.status.running);
  await page.getByTestId("run-pause").click();
  await expect(status).toHaveText(m.run.status.paused);
  await page.getByTestId("run-resume").click();
  await expect(status).toHaveText(m.run.status.running);
  const runs = (await (
    await page.request.get(`/api/runs?workspaceId=${workspace.id}`)
  ).json()) as { id: string; taskId: string }[];
  const runId = runs.find((run) => run.taskId === task.id)?.id;
  if (!runId) throw new Error("The started run is missing");
  const { client, tokenId } = await agentClient(page, workspace.id, agent.id);
  try {
    const get = async () =>
      runDetailSchema.parse(
        payload(
          await client.callTool({ name: "runs.get", arguments: { runId } }),
        ),
      );
    const resumeIfPaused = async () => {
      const current = (await get()).run;
      if (current.status === "paused")
        payload(
          await client.callTool({
            name: "runs.control",
            arguments: { runId, version: current.version, action: "resume" },
          }),
        );
    };
    const profileNow = async () =>
      agentProfileSchema.parse(
        await (await page.request.get(`/api/agents/${agent.id}`)).json(),
      );
    // The agent asks over MCP for a capability it lacks; a person grants it
    // from Inbox › Blockers › Grant access.
    const capability = (await profileNow()).permissions.find(
      (item) => item.decision === "ask",
    )?.capability;
    if (!capability) throw new Error("The new agent has no ask permission");
    const reason = `R1 needs access ${unique()}`;
    const grant = grantSchema.parse(
      payload(
        await client.callTool({
          name: "grants.request",
          arguments: {
            agentId: agent.id,
            taskId: task.id,
            runId,
            capability,
            reason,
          },
        }),
      ),
    );
    expect(grant.status).toBe("pending");
    await page.goto("/inbox");
    await page.getByTestId("inbox-tab-blockers").click();
    const blocker = page.getByTestId("inbox-item").filter({ hasText: reason });
    await expect(blocker).toHaveAttribute("data-kind", "blocker");
    await blocker.getByTestId("inbox-grant-access").click();
    const card = page.getByTestId("grant-card").filter({ hasText: reason });
    await expect(card).toBeVisible();
    await card.getByTestId("grant-allow").click();
    await expect(card.getByTestId("grant-revoke")).toBeEnabled();
    expect(
      (await profileNow()).grants.find((item) => item.id === grant.id)?.status,
    ).toBe("allowed");
    await resumeIfPaused();
    // Attachments need their own grant when the policy asks.
    const allowAttach = async () => {
      if (
        capability === "files.attach" ||
        (await profileNow()).permissions.find(
          (item) => item.capability === "files.attach",
        )?.decision !== "ask"
      )
        return;
      const requested = grantSchema.parse(
        payload(
          await client.callTool({
            name: "grants.request",
            arguments: {
              agentId: agent.id,
              taskId: task.id,
              runId,
              capability: "files.attach",
              reason: "Attach the R1 evidence",
            },
          }),
        ),
      );
      const allowed = await page.request.post(
        `/api/grants/${requested.id}/decision`,
        {
          data: {
            decision: "allow",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
      );
      expect(allowed.status()).toBe(200);
      await resumeIfPaused();
    };
    const submit = async (name: string, summary: string) => {
      let detail = await get();
      payload(
        await client.callTool({
          name: "runs.event",
          arguments: {
            runId,
            version: detail.run.version,
            kind: "test",
            title: `R1 check ${name}`,
            text: "Checklist evidence",
            testStatus: "passed",
            durationMs: 1,
            costMicros: 0,
          },
        }),
      );
      await allowAttach();
      detail = await get();
      payload(
        await client.callTool({
          name: "files.attach",
          arguments: {
            runId,
            version: detail.run.version,
            name,
            mimeType: "text/plain",
            content: `R1 evidence ${name}`,
          },
        }),
      );
      detail = await get();
      payload(
        await client.callTool({
          name: "runs.submit",
          arguments: { runId, version: detail.run.version, summary },
        }),
      );
    };
    await submit("first.txt", "First R1 submission");
    // Request changes: Inbox → review workspace.
    await page.goto("/inbox");
    const item = page.getByTestId("inbox-item").filter({ hasText: title });
    await expect(item).toBeVisible();
    await item.getByTestId("inbox-open-review").click();
    await expect(page.getByTestId("review-artifact")).toHaveCount(1);
    await page.getByTestId("review-comment").fill("Please add a second file.");
    await page.getByTestId("review-request-changes").click();
    await expect(status).toHaveText(m.run.status.changes_requested);
    await expect(page.getByTestId("review-readonly")).toBeVisible();
    // The agent resumes and resubmits; approve via Inbox's approve action.
    payload(
      await client.callTool({
        name: "runs.control",
        arguments: {
          runId,
          version: (await get()).run.version,
          action: "resume",
        },
      }),
    );
    await submit("second.txt", "Second R1 submission");
    await page.goto("/inbox");
    await expect(item).toBeVisible();
    await item.getByTestId("inbox-approve").click();
    // Phone opens the review screen; desktop Inbox shows it beside the list.
    if (!desktop)
      await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}/review`));
    await expect(page.getByTestId("review-artifact")).toHaveCount(2);
    for (const artifact of await page.getByTestId("review-artifact").all())
      await artifact.getByTestId("item-approve").click();
    for (const key of ["matchesDescription", "verifiable", "withinPermissions"])
      await page.getByTestId(`review-check-${key}`).check();
    const approved = waitForApi(page, "POST", `/api/runs/${runId}/review`);
    await page.getByTestId("review-approve").click();
    expect((await approved).status()).toBe(200);
    if (!desktop)
      await expect(page.getByTestId("review-task-status")).toHaveText(
        m.status.done,
      );
    else await expect(page.getByTestId("review-approve")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          taskSchema.parse(
            await (await page.request.get(`/api/tasks/${task.id}`)).json(),
          ).status,
      )
      .toBe("done");
  } finally {
    await client.close();
    await page.request.delete(`/api/agent-tokens/${tokenId}`);
  }
  // Cancel a second run.
  const other = await createTask(`R1 cancel ${unique()}`);
  await page.goto(`/tasks/${other.id}`);
  await chooseWorker(page, desktop, other.id, agent.id);
  await page.getByTestId("run-start").click();
  await expect(status).toHaveText(m.run.status.running);
  await page.getByTestId("run-cancel").click();
  const confirm = page.locator("dialog.confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: m.run.cancel, exact: true })
    .click();
  await expect(confirm).not.toBeVisible();
  await expect(status).toHaveText(m.run.status.canceled);
});

/** Drags a board card into a column, holding at the board edge on phones. */
async function dragToColumn(page: Page, title: string, status: string) {
  const card = page.getByTestId("board-task").filter({
    has: page.getByRole("link", { name: title, exact: true }),
  });
  const handle = card.getByTestId("drag-handle");
  await expect(handle).toBeEnabled();
  await handle.evaluate((node) =>
    node.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  const source = await handle.boundingBox();
  if (!source) throw new Error("Board drag geometry unavailable");
  const viewport = page.viewportSize()!;
  const column = page.getByTestId(`board-column-${status}`);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  let target = await column.boundingBox();
  const visible = (box: typeof target) =>
    !!box && box.x >= 0 && box.x + Math.min(box.width, 120) <= viewport.width;
  if (!visible(target)) {
    // Phones show one column at a time: hold at the right edge to scroll.
    const board = await page.locator(".planning-board").boundingBox();
    if (!board) throw new Error("Board geometry unavailable");
    await page.mouse.move(
      Math.min(viewport.width - 3, board.x + board.width - 3),
      Math.max(board.y + 90, source.y),
      { steps: 10 },
    );
    await expect
      .poll(
        async () => {
          const box = await column.boundingBox();
          return !!box && box.x < viewport.width * 0.6;
        },
        { timeout: 8000 },
      )
      .toBe(true);
    target = await column.boundingBox();
  }
  if (!target) throw new Error("Destination column unavailable");
  await page.mouse.move(
    Math.min(viewport.width - 20, target.x + Math.min(target.width / 2, 120)),
    target.y + 90,
    { steps: 8 },
  );
  await page.mouse.up();
}

test("[item 4] Projects", async ({ page }, info) => {
  const { workspace } = await freshSignedIn(page, info, "projects");
  // Create the project through the project switcher.
  await page.goto("/projects");
  await page.getByTestId("project-filters").click();
  await page.getByTestId("new-project").click();
  const projectName = `R1 board ${unique()}`;
  await page.getByTestId("project-name").fill(projectName);
  const projectAck = waitForApi(page, "POST", "/api/projects");
  await page.getByTestId("project-submit").click();
  const project = projectSchema.parse(await (await projectAck).json());
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}`));
  const make = async (title: string, labels: string[], priority: number) => {
    const response = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        title,
        ownerId: workspace.memberId,
        projectId: project.id,
        labels,
        priority,
      },
    });
    expect(response.status()).toBe(201);
    return taskSchema.parse(await response.json());
  };
  const dragged = await make(`R1 drag ${unique()}`, ["release"], 1);
  const controlled = await make(`R1 control ${unique()}`, [], 3);
  await page.reload();
  await expect(page.getByTestId("board-task")).toHaveCount(2);
  // Drag to In progress.
  const moved = waitForApi(page, "PATCH", `/api/tasks/${dragged.id}`);
  await dragToColumn(page, dragged.title, "in_progress");
  const movedResponse = await moved;
  expect(movedResponse.status()).toBe(200);
  expect(taskSchema.parse(await movedResponse.json()).status).toBe(
    "in_progress",
  );
  await expect(
    page
      .getByTestId("board-column-in_progress")
      .getByRole("link", { name: dragged.title, exact: true }),
  ).toBeAttached();
  // The status control on the other card.
  await page.reload();
  const card = page
    .getByTestId("board-task")
    .filter({ hasText: controlled.title });
  await card.scrollIntoViewIfNeeded();
  await card.locator("details > summary").click();
  const changed = waitForApi(page, "PATCH", `/api/tasks/${controlled.id}`);
  await card.getByTestId("board-status").selectOption("done");
  expect((await changed).status()).toBe(200);
  await expect(
    page
      .getByTestId("board-column-done")
      .getByRole("link", { name: controlled.title, exact: true }),
  ).toBeAttached();
  const stored = async (id: string) =>
    taskSchema.parse(await (await page.request.get(`/api/tasks/${id}`)).json())
      .status;
  expect(await stored(dragged.id)).toBe("in_progress");
  expect(await stored(controlled.id)).toBe("done");
  // List view with filters.
  await page.getByTestId("project-view-list").click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByTestId("board-task")).toHaveCount(2);
  await page.getByTestId("project-filters").click();
  await page.getByTestId("project-filter").selectOption("mine");
  await page.getByTestId("project-sort").selectOption("priority");
  await page.getByTestId("project-label").fill("release");
  await closeFieldSheet(page, "project-select");
  await expect(page.getByTestId("board-task")).toHaveCount(1);
  await expect(page.getByTestId("board-task")).toContainText(dragged.title);
  await page.getByTestId("project-filters").click();
  await page.getByTestId("project-label").fill("");
  await closeFieldSheet(page, "project-select");
  await expect(page.getByTestId("board-task")).toHaveCount(2);
});

/** Scrolls an event into view and waits until it is the topmost element. */
async function eventBox(page: Page, title: string) {
  const event = page
    .locator(".sx__time-grid-event")
    .filter({ hasText: title })
    .first();
  await expect(event).toBeVisible();
  await event.evaluate((element) =>
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    }),
  );
  await expect
    .poll(() =>
      event.evaluate((element) => {
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
  const box = await event.boundingBox();
  if (!box) throw new Error("Calendar event geometry unavailable");
  return { event, box };
}

test("[item 5] Calendar", async ({ page }, info) => {
  const { me, workspace } = await freshSignedIn(page, info, "calendar");
  const tz = me.user.tz;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const later = new Date(`${date}T12:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 3);
  const dueAt = calendarWallToInstant(
    `${later.toISOString().slice(0, 10)}T18:00`,
    tz,
  );
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: `R1 calendar ${unique()}`,
      dueAt,
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  const stored = async () =>
    taskCalendarSchema.parse(
      await (await page.request.get(`/api/tasks/${task.id}/calendar`)).json(),
    );
  const ack = () => waitForApi(page, "PATCH", `/api/tasks/${task.id}/calendar`);
  await page.goto("/calendar");
  await page.getByTestId("calendar-day").click();
  // Schedule the unscheduled task from the tray.
  await page.getByTestId(`schedule-task-${task.id}`).click();
  await page.getByTestId("schedule-start").fill(`${date}T09:00`);
  await page.getByTestId("schedule-end").fill(`${date}T10:00`);
  const scheduled = ack();
  await page.getByTestId("schedule-save").click();
  expect((await scheduled).status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = (await stored()).schedule;
  expect(first?.startAt).toBe(calendarWallToInstant(`${date}T09:00`, tz));
  // Drag later in the day view.
  let { box } = await eventBox(page, task.title);
  const moved = ack();
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.move(box.x + box.width / 2, box.y + 18 + 60, { steps: 8 });
  await page.mouse.up();
  expect((await moved).status()).toBe(200);
  const afterMove = (await stored()).schedule;
  expect(Date.parse(afterMove!.startAt)).toBeGreaterThan(
    Date.parse(first!.startAt),
  );
  expect((await stored()).task.dueAt).toBe(dueAt);
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
  // Resize from the bottom edge.
  ({ box } = await eventBox(page, task.title));
  const handle = page
    .locator(".sx__time-grid-event")
    .filter({ hasText: task.title })
    .first()
    .locator(".sx__time-grid-event-resize-handle");
  const grip = await handle.boundingBox();
  if (!grip) throw new Error("Resize handle unavailable");
  const resized = ack();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y + grip.height / 2 + 40,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  expect((await resized).status()).toBe(200);
  const afterResize = (await stored()).schedule;
  expect(Date.parse(afterResize!.endAt)).toBeGreaterThan(
    Date.parse(afterMove!.endAt),
  );
  expect(afterResize!.startAt).toBe(afterMove!.startAt);
  // Undo the resize.
  const undone = ack();
  await page.getByTestId("calendar-undo").click();
  expect((await undone).status()).toBe(200);
  await expect
    .poll(async () => (await stored()).schedule?.endAt)
    .toBe(afterMove!.endAt);
  // Week and month show the scheduled task too.
  await page.getByTestId("calendar-week").click();
  await expect(
    page
      .locator(".sx__time-grid-event")
      .filter({ hasText: task.title })
      .first(),
  ).toBeAttached();
  await page.getByTestId("calendar-month-grid").click();
  await expect(
    page
      .locator(".sx__month-grid-event")
      .filter({ hasText: task.title })
      .first(),
  ).toBeAttached();
  await page.getByTestId("calendar-day").click();
  await expect(
    page
      .locator(".sx__time-grid-event")
      .filter({ hasText: task.title })
      .first(),
  ).toBeAttached();
});

test("[item 6] Search and organizations", async ({ page, browser }, info) => {
  const { m } = meta(info);
  const { workspace } = await freshSignedIn(page, info, "search");
  const title = `R1 searchable ${unique()}`;
  const created = await page.request.post("/api/tasks", {
    data: { workspaceId: workspace.id, title, ownerId: workspace.memberId },
  });
  expect(created.status()).toBe(201);
  const task = taskSchema.parse(await created.json());
  // ⌘K (Ctrl+K off macOS) and open a result.
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-input")).toBeVisible();
  await page.getByTestId("search-input").fill(title);
  const result = page.getByTestId("search-result").filter({ hasText: title });
  await expect(result.first()).toBeVisible();
  await result.first().click();
  await expect(page.getByTestId("task-detail-heading")).toHaveText(title);
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}`));
  // Create an organization, then switch back.
  await page.goto("/orgs");
  await page
    .getByRole("button", { name: m.organization.create, exact: true })
    .click();
  const orgName = `R1 org ${unique()}`;
  await page.locator("#org-name").fill(orgName);
  const orgAck = waitForApi(page, "POST", "/api/workspaces");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.organization.create, exact: true })
    .click();
  const orgResponse = await orgAck;
  expect(orgResponse.status()).toBe(201);
  const organization = workspaceSchema.parse(await orgResponse.json());
  await expect(
    page.getByTestId(`workspace-${organization.id}`),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId(`workspace-${workspace.id}`).click();
  await expect(page.getByTestId(`workspace-${workspace.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/");
  await expect(
    page.getByTestId("task-card").filter({ hasText: title }),
  ).toBeVisible();
  // Invite a member; the link is checked, never printed.
  await page.goto("/orgs");
  await page
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  await page.locator("#invite-email").fill(`release-${unique()}@example.test`);
  await page.locator("#invite-role").selectOption("member");
  const inviteAck = waitForApi(
    page,
    "POST",
    `/api/workspaces/${workspace.id}/invites`,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.organization.invite, exact: true })
    .click();
  expect((await inviteAck).status()).toBe(201);
  await expect(page.locator("#issued-invite")).toBeVisible();
  const link = new URL(await page.locator("#issued-invite").inputValue());
  expect(link.origin).toBe(new URL(baseURL).origin);
  expect(link.hash.startsWith("#invite=")).toBe(true);
  await expect(page.getByTestId("invite-email-delivery")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.planning.close })
    .click();
  // Change a member's role.
  const second = await secondPerson(
    browser,
    page,
    workspace.id,
    info,
    "member role change",
  );
  if (!second) return;
  try {
    await page.reload();
    const role = page.getByTestId(`role-${second.member.id}`);
    await expect(role).toHaveValue("member");
    const changed = waitForApi(
      page,
      "PATCH",
      `/api/workspaces/${workspace.id}/members/${second.member.id}`,
    );
    await role.selectOption("guest");
    expect((await changed).status()).toBe(200);
    await expect(role).toHaveValue("guest");
    expect(
      (await listMembers(page.request, workspace.id)).find(
        (member) => member.id === second.member.id,
      )?.role,
    ).toBe("guest");
  } finally {
    await second.context.close();
  }
});

test("[item 7] Settings", async ({ page }, info) => {
  const { desktop } = meta(info);
  const { workspace } = await freshSignedIn(page, info, "settings");
  // Notification preferences: flip review alerts and pick a digest time.
  const before = notificationPreferencesSchema.parse(
    await (await page.request.get("/api/me/notifications")).json(),
  );
  if (desktop) await page.goto("/me?tab=settings");
  else {
    await page.goto("/me");
    await page.getByTestId("open-notifications").click();
    await expect(page).toHaveURL(/\/me\/notifications$/);
  }
  const review = page.getByTestId("notification-review");
  await expect(review).toBeVisible();
  const toggled = waitForApi(page, "PATCH", "/api/me/notifications");
  await review.click();
  expect((await toggled).status()).toBe(200);
  const time = page.getByTestId("notification-time-18:00");
  // Controls stay disabled until the previous save settles.
  await expect(review).toBeEnabled();
  await expect(time).toBeEnabled();
  if (!(await time.isChecked())) {
    const timed = waitForApi(page, "PATCH", "/api/me/notifications");
    await time.click();
    expect((await timed).status()).toBe(200);
    await expect(time).toBeChecked();
  }
  await page.reload();
  await expect(review).toBeChecked({ checked: !before.review });
  await expect(time).toBeChecked();
  const after = notificationPreferencesSchema.parse(
    await (await page.request.get("/api/me/notifications")).json(),
  );
  expect(after.review).toBe(!before.review);
  expect(after.digestAt).toBe("18:00");
  // Agent profile: a permission and the review policy.
  const agent = await addAgentViaTeam(page, workspace.id);
  await page.goto(`/agents/${agent.id}`);
  await expect(page.getByTestId("agent-profile-heading")).toHaveText(
    agent.name,
  );
  const profile = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  const current = profile.permissions.find(
    (item) => item.capability === "web.search",
  )?.decision;
  const next = current === "allow" ? "ask" : "allow";
  const permission = page.getByTestId(`permission-web.search-${next}`);
  const permissionAck = waitForApi(
    page,
    "PUT",
    `/api/agents/${agent.id}/permissions`,
  );
  await permission.click();
  expect((await permissionAck).status()).toBe(200);
  await expect(permission).toHaveAttribute("aria-pressed", "true");
  const policy =
    profile.reviewPolicy === "always_review" ? "ask_only" : "always_review";
  const details = page.getByTestId("agent-settings-details");
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator("summary").first().click();
  await page.getByTestId("agent-policy").selectOption(policy);
  const saved = waitForApi(page, "PATCH", `/api/agents/${agent.id}`);
  await page.getByTestId("agent-save").click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByTestId(`permission-web.search-${next}`),
  ).toHaveAttribute("aria-pressed", "true");
  const stored = agentProfileSchema.parse(
    await (await page.request.get(`/api/agents/${agent.id}`)).json(),
  );
  expect(stored.reviewPolicy).toBe(policy);
  expect(
    stored.permissions.find((item) => item.capability === "web.search")
      ?.decision,
  ).toBe(next);
});

test("[item 8] MCP", async ({ page, context }, info) => {
  const { m, desktop } = meta(info);
  const { workspace } = await freshSignedIn(page, info, "mcp");
  const agent = await addAgentViaTeam(page, workspace.id);
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `R1-MCP-${unique()}` } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  // Me › MCP shows the endpoint, the copyable config, scopes and call log.
  await page.goto(desktop ? "/me?tab=settings" : "/me");
  await page.getByTestId("open-mcp").click();
  await expect(page).toHaveURL(/\/me\/mcp$/);
  const endpoint = `${new URL(baseURL).origin}/mcp`;
  await expect(page.getByTestId("mcp-endpoint")).toHaveText(endpoint);
  await expect(page.locator(".mcp-config")).toContainText(endpoint);
  await expect(page.locator(".mcp-config")).toContainText("mcpServers");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(baseURL).origin,
  });
  await page.getByRole("button", { name: m.mcp.copyConfig }).click();
  await expect(page.getByTestId("toast")).toContainText(m.mcp.copied);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied).mcpServers.taff.url).toBe(endpoint);
  const scopes = page.locator(".mcp-scopes label.mcp-scope");
  await expect(scopes).toHaveCount(ROUND_TRIP_SCOPES.length);
  for (const scope of ROUND_TRIP_SCOPES)
    await expect(
      scopes.locator("code").filter({ hasText: new RegExp(`^${scope}$`) }),
    ).toHaveCount(1);
  await expect(page.locator("#mcp-calls-heading")).toHaveText(m.mcp.callLog);
  const card = (name: string) =>
    page
      .getByTestId("token-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  // Regenerating revokes the old token and lists a new one under the same name.
  const activeCard = (name: string) =>
    card(name).filter({ has: page.locator('.mcp-state[data-state="active"]') });
  const openCard = async (name: string) => {
    const details = activeCard(name).locator("details");
    if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
      await details.locator("summary").click();
  };
  /** Issues a token from the form and reads it once, without printing it. */
  const issue = async (name: string) => {
    await page.getByTestId("token-name").fill(name);
    await page.getByTestId("token-agent").selectOption(agent.id);
    for (const scope of ROUND_TRIP_SCOPES) {
      const toggle = scopes
        .filter({
          has: page
            .locator("code")
            .filter({ hasText: new RegExp(`^${scope}$`) }),
        })
        .getByRole("switch");
      if (!(await toggle.isChecked())) await toggle.click();
      await expect(toggle).toBeChecked();
    }
    const created = waitForApi(page, "POST", "/api/agent-tokens");
    await page.getByTestId("token-submit").click();
    expect((await created).status()).toBe(201);
    const shown = page.getByTestId("issued-token");
    await expect(shown).toBeVisible();
    const token = (await shown.locator("code").first().textContent()) ?? "";
    expect(token.startsWith("taff_"), "token has the taff_ prefix").toBe(true);
    await expect(card(name)).toBeVisible();
    return token;
  };
  // Issue (shown once), regenerate with confirm, revoke with confirm, undo.
  const firstName = `R1 token ${unique()}`;
  const first = await issue(firstName);
  await page.reload();
  await expect(page.getByTestId("issued-token")).toHaveCount(0);
  await openCard(firstName);
  await activeCard(firstName).getByTestId("token-regenerate").click();
  const regenerated = waitForApi(page, "POST", /\/api\/agent-tokens/);
  await page.getByTestId("token-confirm").click();
  expect((await regenerated).status()).toBeLessThan(300);
  await expect(page.getByTestId("issued-token")).toBeVisible();
  const replacement =
    (await page
      .getByTestId("issued-token")
      .locator("code")
      .first()
      .textContent()) ?? "";
  expect(replacement.startsWith("taff_"), "regenerated prefix").toBe(true);
  expect(replacement !== first, "regenerate issues a new token").toBe(true);
  const regeneratedName = firstName;
  await expect(card(regeneratedName).first()).toBeVisible();
  await expect(
    card(firstName).locator('.mcp-state[data-state="revoked"]'),
  ).toHaveCount(1);
  await openCard(regeneratedName);
  await activeCard(regeneratedName).getByTestId("token-revoke").click();
  const revoked = waitForApi(page, "DELETE", /\/api\/agent-tokens\//);
  await page.getByTestId("token-confirm").click();
  expect((await revoked).status()).toBe(200);
  await expect(
    card(regeneratedName).locator('.mcp-state[data-state="active"]'),
  ).toHaveCount(0);
  const restored = waitForApi(page, "POST", /\/restore$/);
  await page.getByTestId("toast-action").click();
  expect((await restored).status()).toBe(200);
  await expect(
    card(regeneratedName).locator('.mcp-state[data-state="active"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: m.mcp.dismiss }).click();
  await expect(page.getByTestId("issued-token")).toHaveCount(0);
  // A real MCP client round trip with a fresh token. The project board is
  // open before the client creates the task, to see it arrive in real time.
  const roundTripName = `R1 round trip ${unique()}`;
  const token = await issue(roundTripName);
  await page.getByRole("button", { name: m.mcp.dismiss }).click();
  const board = await context.newPage();
  await board.goto(`/projects/${project.id}`);
  await expect(board.getByTestId("project-filters")).toContainText(
    project.name,
  );
  let failures = 0;
  const check = (name: string, ok: boolean) => {
    recordCheck(info, name, ok);
    if (!ok) {
      failures++;
      console.log(`[${info.project.name}] MCP check failed: ${name}`);
    }
  };
  await runMcpRoundTrip({
    endpoint: new URL("/mcp", baseURL),
    token,
    agentId: agent.id,
    workspace: { id: workspace.id, memberId: workspace.memberId },
    project,
    rateLimit,
    check,
    human: httpHuman(page.request, workspace.id),
    clientName: "taff-release",
    ...(process.env.RELEASE_SKIP_RATE_LIMIT
      ? { skipRateLimit: "RELEASE_SKIP_RATE_LIMIT is set" }
      : {}),
    onTaskCreated: async (task) => {
      // No reload: the realtime channel delivers it.
      await expect(
        board.getByRole("link", { name: task.title, exact: true }),
      ).toBeVisible();
      check(
        "the MCP-created task appears on the open board in real time",
        true,
      );
    },
    revokeToken: async () => {
      // Revoke from the UI, and see the calls in the call log.
      await page.reload();
      await openCard(roundTripName);
      await activeCard(roundTripName).getByTestId("token-revoke").click();
      const gone = waitForApi(page, "DELETE", /\/api\/agent-tokens\//);
      await page.getByTestId("token-confirm").click();
      expect((await gone).status()).toBe(200);
      await expect(
        card(roundTripName).locator('.mcp-state[data-state="revoked"]'),
      ).toHaveCount(1);
      await page.reload();
      const calls = page.locator(".mcp-call");
      await expect(
        calls
          .filter({ has: page.locator("code", { hasText: /^tasks\.create$/ }) })
          .first(),
      ).toBeVisible();
      await expect(
        calls.filter({ hasText: roundTripName }).first(),
      ).toBeVisible();
      if (!process.env.RELEASE_SKIP_RATE_LIMIT)
        await expect(
          calls.locator('dd[data-status="rate_limited"]').first(),
        ).toBeVisible();
      check("the call log UI lists the round trip's calls", true);
    },
  });
  if (process.env.RELEASE_SKIP_RATE_LIMIT)
    skipStep(info, "MCP rate-limit probe: RELEASE_SKIP_RATE_LIMIT is set");
  await board.close();
  expect(failures, "MCP round-trip checks failed").toBe(0);
});
