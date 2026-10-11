import { expect, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  memberListSchema,
  memberSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { closeQuickField, openQuickAdd, openQuickField } from "./support/tasks";

test("Team creates a real custom agent through UI and assigns it as a task worker", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  await page.goto("/orgs#team");
  await expect(page.getByTestId("team-add-agent")).toBeEnabled();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  const peer = await page.context().newPage();
  await peer.goto("/orgs#team");
  await expect(peer.getByTestId("team-add-agent")).toBeEnabled();
  const name = `Custom agent ${locale} ${crypto.randomUUID()}`;
  let writes = 0;
  let temporaryProfileReads = 0;
  let memberReads = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path === `/api/workspaces/${workspace.id}/members` &&
      request.method() === "POST"
    )
      writes++;
    if (path.startsWith("/api/agents/optimistic:")) temporaryProfileReads++;
    if (path === "/api/members") memberReads++;
  });
  await page.getByTestId("team-add-agent").click();
  const dialog = page.getByRole("dialog");
  await page.getByTestId("agent-name").fill("   ");
  await page.getByTestId("agent-create").click();
  await expect(dialog.getByRole("alert")).toContainText(
    messages[locale].errors.invalid_input,
  );
  expect(writes).toBe(0);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pattern = `**/api/workspaces/${workspace.id}/members`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    entered();
    await gate;
    await route.continue();
  });
  try {
    await page.getByTestId("agent-name").fill(`  ${name}  `);
    const created = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/workspaces/${workspace.id}/members` &&
        response.request().method() === "POST",
    );
    await page.getByTestId("agent-create").click();
    await seen;
    const pending = page.locator(".team-directory .member-role-row").filter({
      hasText: name,
    });
    await expect(pending.locator('[aria-busy="true"]')).toBeVisible();
    await expect(pending.locator("a")).toHaveCount(0);
    const readsBeforeResize = memberReads;
    // Age the settled cache without waiting 31 seconds or advancing timers.
    await page.clock.setFixedTime(
      (await page.evaluate(() => Date.now())) + 31_000,
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".sidebar")).toBeVisible();
    await peer.bringToFront();
    await page.bringToFront();
    await expect(pending.locator('[aria-busy="true"]')).toBeVisible();
    expect(memberReads).toBe(readsBeforeResize);
    await expect(
      page.locator('.sidebar a[href^="/agents/optimistic:"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("agent-create")).toBeDisabled();
    expect(temporaryProfileReads).toBe(0);
    release();
    const response = await created;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toEqual({ name, kind: "agent" });
    const member = memberSchema.parse(await response.json());
    expect(member).toMatchObject({
      name,
      kind: "agent",
      userId: null,
      workspaceId: workspace.id,
    });
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator(`.team-agent-link[href="/agents/${member.id}"]`),
    ).toContainText(name);
    await expect(
      peer.locator(`.team-agent-link[href="/agents/${member.id}"]`),
    ).toContainText(name);
    const stored = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    expect(stored.find((item) => item.id === member.id)?.name).toBe(name);
    expect(writes).toBe(1);
    expect(temporaryProfileReads).toBe(0);
    await page.goto("/");
    await openQuickAdd(page);
    const title = `Agent-created worker ${crypto.randomUUID()}`;
    await page.getByTestId("quick-title").fill(title);
    await openQuickField(page, "worker");
    await expect(
      page.getByTestId("quick-worker").locator(`option[value="${member.id}"]`),
    ).toHaveText(`${name} · ${messages[locale].agent}`);
    await page.getByTestId("quick-worker").selectOption(member.id);
    await closeQuickField(page, "worker");
    const taskCreated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/tasks" &&
        response.request().method() === "POST",
    );
    await page.getByTestId("quick-create").click();
    const taskResponse = await taskCreated;
    expect(taskResponse.status()).toBe(201);
    const task = taskSchema.parse(await taskResponse.json());
    expect(task.workerId).toBe(member.id);
    expect(task.ownerId).toBe(workspace.memberId);
    await expect(
      page.getByTestId("task-card").filter({ hasText: title }),
    ).toContainText(name);
  } finally {
    release();
    await page.unroute(pattern);
    await peer.close();
  }
});

test("failed agent creation rolls back the Team row and preserves the editable name", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  await page.goto("/orgs#team");
  await page.getByTestId("team-add-agent").click();
  const name = `Retry agent ${crypto.randomUUID()}`;
  await page.getByTestId("agent-name").fill(name);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pattern = `**/api/workspaces/${workspace.id}/members`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    entered();
    await gate;
    await route.fulfill({ status: 403, json: { error: "forbidden" } });
  });
  try {
    await page.getByTestId("agent-create").click();
    await seen;
    const row = page.locator(".team-directory .member-role-row").filter({
      hasText: name,
    });
    await expect(row).toBeVisible();
    release();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      messages[locale].errors.forbidden,
    );
    await expect(row).toHaveCount(0);
    await expect(page.getByTestId("agent-name")).toHaveValue(name);
    await expect(page.getByTestId("agent-create")).toBeEnabled();
    const members = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    expect(members.some((member) => member.name === name)).toBe(false);
  } finally {
    release();
    await page.unroute(pattern);
  }
});

test("real member and guest memberships cannot add workspace agents", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as TestLocale;
  const admin = await freshAccount(page, locale);
  const workspace = admin.workspaces[0];
  for (const role of ["member", "guest"] as const) {
    const context = await browser.newContext({ baseURL: process.env.AUTH_URL });
    const recipient = await context.newPage();
    try {
      const me = await freshAccount(recipient, locale);
      const issued = await page.request.post(
        `/api/workspaces/${workspace.id}/invites`,
        { data: { email: me.user.email, role } },
      );
      expect(issued.status()).toBe(201);
      const invite = issuedWorkspaceInviteSchema.parse(await issued.json());
      const accepted = await recipient.request.post(
        "/api/workspace-invites/accept",
        { data: { token: invite.token } },
      );
      expect(accepted.status()).toBe(200);
      const access = await recipient.request.get(
        `/api/workspaces/${workspace.id}/access`,
      );
      expect(access.status()).toBe(200);
      expect((await access.json()).canManageRoles).toBe(false);
      await recipient.goto("/orgs");
      await recipient.getByTestId(`workspace-${workspace.id}`).click();
      await recipient.goto("/orgs#team");
      await expect(recipient.locator(".team-directory > h1")).toBeVisible();
      await expect(recipient.getByTestId("team-add-agent")).toHaveCount(0);
      const denied = await recipient.request.post(
        `/api/workspaces/${workspace.id}/members`,
        { data: { name: `Denied ${role} agent`, kind: "agent" } },
      );
      expect(denied.status()).toBe(403);
      expect(await denied.json()).toEqual({ error: "forbidden" });
      const members = memberListSchema.parse(
        await (
          await page.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      );
      expect(
        members.some((member) => member.name === `Denied ${role} agent`),
      ).toBe(false);
    } finally {
      await context.close();
    }
  }
});
