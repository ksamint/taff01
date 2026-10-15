import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  agentProfileSchema,
  memberListSchema,
  meSchema,
} from "../../packages/schemas/src/index";
import { messages } from "../support/messages";

const execute = promisify(execFile);
const origin = process.env.RELEASE_BASE_URL ?? "https://taff.apuch.cn";
const workspaceName = "Taff verification";
process.env.RELEASE_SKIP_RATE_LIMIT = "1";
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
if (
  process.env.RELEASE_DEBUG ||
  process.env.RELEASE_MAIL_LOG ||
  process.env.RELEASE_DEMO_PASSWORD ||
  process.env.DEMO_PASSWORD
)
  throw new Error("BLOCKED: unsafe live harness environment");
const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
export const runLabel = () => stamp;
type Entry = {
  kind: string;
  id: string;
  workspaceId?: string;
  retained?: boolean;
};
type State = {
  entries: Entry[];
  pending: Promise<void>[];
  pageErrors: number;
  httpFailures: { method: string; path: string; status: number }[];
  workspaceId?: string;
  profiles: Map<string, any>;
  preferences?: any;
  primaryProfile?: { locale: string; tz: string };
  themes: Map<Page, string | null>;
};
let state: State | undefined;
export function trackTask(id: string) {
  if (state && id)
    state.entries.push({ kind: "tasks", id, workspaceId: state.workspaceId });
}
export function credentialAccount() {
  const username = process.env.TAFF_VERIFY_USERNAME,
    password = process.env.TAFF_VERIFY_PASSWORD,
    email = process.env.TAFF_VERIFY_EMAIL;
  if (!username || !password || !email)
    throw new Error("BLOCKED: runtime verification credentials missing");
  return { username, password, email, name: "Taff verification" };
}
let cleanupStep = "cleanup.begin";
class SafeApiFailure extends Error {
  constructor(
    readonly step: string,
    readonly httpStatus: number | undefined,
    readonly errorCode: string,
    readonly location = "e2e/live.ts#checked",
  ) {
    super("API operation failed; sanitized diagnostic only");
  }
}
async function checked(response: any, label: string) {
  cleanupStep = label;
  if (!response.ok()) {
    let code = "api_error";
    try {
      const body = await response.json();
      if (
        [
          "unauthorized",
          "forbidden",
          "conflict",
          "not_found",
          "invalid_input",
          "rate_limited",
          "internal_error",
          "unavailable",
        ].includes(body?.error)
      )
        code = body.error;
    } catch {}
    throw new SafeApiFailure(label, response.status(), code);
  }
  return response.json();
}

async function captureProfileAndTheme(page: Page, me?: any) {
  if (!state) return;
  const identity =
    me ??
    meSchema.parse(
      await checked(await page.request.get("/api/me"), "profile baseline"),
    );
  if (!state.primaryProfile)
    state.primaryProfile = {
      locale: identity.user.locale,
      tz: identity.user.tz,
    };
  if (!state.themes.has(page))
    state.themes.set(
      page,
      await page.evaluate(() => localStorage.getItem("taff-theme")),
    );
}
async function cleanupHttp(step: string, operation: () => Promise<any>) {
  cleanupStep = step;
  try {
    return await checked(await operation(), step);
  } catch (error) {
    if (error instanceof SafeApiFailure) throw error;
    throw new SafeApiFailure(
      step,
      undefined,
      "transport_or_local_error",
      "e2e/live.ts#cleanupHttp",
    );
  }
}
export async function selectVerificationWorkspace(page: Page) {
  const me = meSchema.parse(
    await checked(await page.request.get("/api/me"), "verification identity"),
  );
  await captureProfileAndTheme(page, me);
  const found = me.workspaces.filter((w) => w.name === workspaceName);
  if (found.length !== 1 || found[0].role !== "admin")
    throw new Error("BLOCKED: exact verification admin workspace unavailable");
  const workspace = found[0];
  if (state) state.workspaceId = workspace.id;
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  await expect(page.getByTestId(`workspace-${workspace.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toBeVisible();
  return { me, workspace };
}
export async function liveSignIn(page: Page, locale: string) {
  const account = credentialAccount();
  await page.goto("/");
  await page.getByTestId("auth-email").fill(account.username);
  await page.getByTestId("auth-password").fill(account.password);
  for (let attempt = 0; attempt < 4; attempt++) {
    const promise = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/auth/sign-in/username" &&
        r.request().method() === "POST",
    );
    await page.getByTestId("auth-submit").click();
    const response = await promise;
    if (response.status() === 429) {
      if (attempt === 3) throw new Error("BLOCKED: auth throttled");
      await page.waitForTimeout(10000);
      continue;
    }
    if (response.status() !== 200)
      throw new Error("BLOCKED: dedicated sign-in failed");
    break;
  }
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await captureProfileAndTheme(page);
  if (state && !state.preferences)
    state.preferences = await checked(
      await page.request.get("/api/me/notifications"),
      "notification baseline",
    );
  const tz = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await checked(
    await page.request.patch("/api/profile", { data: { locale, tz } }),
    "locale selection",
  );
  const { workspace } = await selectVerificationWorkspace(page);
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale as keyof typeof messages].today,
  );
  const me = meSchema.parse(
    await checked(await page.request.get("/api/me"), "identity refresh"),
  );
  return { account, me, workspace };
}
export async function verificationAgent(page: Page, workspaceId: string) {
  const members = memberListSchema.parse(
    await checked(
      await page.request.get(`/api/members?workspaceId=${workspaceId}`),
      "verification members",
    ),
  );
  const found = members.filter(
    (m) => m.kind === "agent" && m.name === "Verification agent",
  );
  if (found.length !== 1)
    throw new Error(
      "BLOCKED: dedicated Verification agent unavailable or ambiguous",
    );
  const agent = found[0];
  if (state && !state.profiles.has(agent.id))
    state.profiles.set(
      agent.id,
      agentProfileSchema.parse(
        await checked(
          await page.request.get(`/api/agents/${agent.id}`),
          "agent baseline",
        ),
      ),
    );
  return agent;
}
async function captureResponse(method: string, url: string, response: any) {
  if (!state || method !== "POST" || response.status() !== 201) return;
  const path = new URL(url, origin).pathname;
  let kind: string | undefined;
  if (path === "/api/tasks") kind = "tasks";
  else if (path === "/api/projects") kind = "projects";
  else if (path === "/api/companies") kind = "companies";
  else if (path === "/api/contacts") kind = "contacts";
  else if (path === "/api/workspaces") kind = "workspaces";
  else if (
    path === "/api/agent-tokens" ||
    /^\/api\/agent-tokens\/.+\/regenerate$/.test(path)
  )
    kind = "agent-tokens";
  else if (/\/invites$/.test(path)) kind = "invites";
  else if (/^\/api\/workspaces\/[^/]+\/mind\/nodes$/.test(path))
    kind = "mind-nodes";
  else if (/^\/api\/workspaces\/[^/]+\/mind\/sources$/.test(path))
    kind = "mind-sources";
  else if (/^\/api\/workspaces\/[^/]+\/mind\/edges$/.test(path))
    kind = "mind-edges";
  else if (/^\/api\/mind\/nodes\/[^/]+\/task$/.test(path))
    kind = "mind-validation-task";
  if (!kind) return;
  let value: any;
  try {
    value = await response.json();
  } catch {
    return;
  }
  if (kind === "mind-validation-task" && value.task?.id) {
    state.entries.push({
      kind: "tasks",
      id: value.task.id,
      workspaceId: value.task.workspaceId,
    });
    return;
  }
  if (value.id)
    state.entries.push({
      kind,
      id: value.id,
      workspaceId: value.workspaceId ?? state.workspaceId,
    });
}
function instrument(context: BrowserContext) {
  context.on("page", watchPage);
  for (const page of context.pages()) watchPage(page);
  const request = context.request as any;
  const post = request.post.bind(request);
  request.post = async (url: string, options: any) => {
    const response = await post(url, options);
    await captureResponse("POST", url, response);
    return response;
  };
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname.startsWith("/api/"))
      state?.httpFailures.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      });

    const pending = captureResponse(
      response.request().method(),
      response.url(),
      response,
    );
    state?.pending.push(pending);
  });
}
const watched = new WeakSet<Page>();
function watchPage(page: Page) {
  if (watched.has(page)) return;
  watched.add(page);
  page.on("pageerror", () => {
    if (state) state.pageErrors++;
  });
}
async function cleanUp(request: APIRequestContext, info: TestInfo) {
  if (!state) return;
  const current = state;
  await Promise.all(current.pending);
  const entries = [
    ...new Map(current.entries.map((e) => [`${e.kind}:${e.id}`, e])).values(),
  ];
  // MCP-created follower tasks and child tasks can bypass Playwright's HTTP wrapper.
  for (const project of entries.filter((e) => e.kind === "projects")) {
    const response = await request.get(
      `/api/tasks?workspaceId=${current.workspaceId}&projectId=${project.id}`,
    );
    if (response.ok())
      for (const task of await response.json())
        if (!entries.some((e) => e.kind === "tasks" && e.id === task.id))
          entries.push({
            kind: "tasks",
            id: task.id,
            workspaceId: current.workspaceId,
          });
  }

  const notes: any[] = [];
  let failed = 0;
  const perform = async (kind: string, id: string, fn: () => Promise<void>) => {
    cleanupStep = `${kind}.begin`;
    try {
      await fn();
      notes.push({ kind, id, status: "cleaned" });
    } catch (error) {
      failed++;
      const known = error instanceof SafeApiFailure ? error : undefined;
      notes.push({
        kind,
        id,
        status: "cleanup-failed",
        step: known?.step ?? cleanupStep,
        errorCode: known?.errorCode ?? "local_cleanup_error",
        ...(known?.httpStatus !== undefined
          ? { httpStatus: known.httpStatus }
          : {}),
        location: known?.location ?? "e2e/live.ts#cleanUp",
      });
    }
  };

  for (const e of entries.filter((e) => e.kind === "agent-tokens"))
    await perform(e.kind, e.id, async () => {
      const response = await request.delete(`/api/agent-tokens/${e.id}`);
      if (![200, 404].includes(response.status())) throw new Error("cleanup");
    });
  const taskEntries = entries.filter((e) => e.kind === "tasks");
  const taskParents = new Map<string, string | null>();
  // The production subtask guard requires every descendant to finish first.
  // Discover only descendants of journaled current-run tasks, then sort deepest first.
  for (let index = 0; index < taskEntries.length; index++) {
    const e = taskEntries[index];
    await perform("task-discovery", e.id, async () => {
      const task = await cleanupHttp("task.discover-hierarchy-row", () =>
        request.get(`/api/tasks/${e.id}`),
      );
      if (task.workspaceId !== current.workspaceId)
        throw new SafeApiFailure(
          "task.check-hierarchy-workspace",
          undefined,
          "outside_verification_workspace",
          "e2e/live.ts#cleanUp",
        );
      taskParents.set(e.id, task.parentId ?? null);
      const children = await cleanupHttp(
        "task.discover-hierarchy-children",
        () =>
          request.get(
            `/api/tasks?workspaceId=${current.workspaceId}&parentId=${e.id}`,
          ),
      );
      for (const child of children)
        if (
          !entries.some((item) => item.kind === "tasks" && item.id === child.id)
        ) {
          const childEntry = {
            kind: "tasks",
            id: child.id,
            workspaceId: current.workspaceId,
          };
          entries.push(childEntry);
          taskEntries.push(childEntry);
        }
    });
  }
  const taskDepth = (id: string) => {
    let depth = 0,
      parent = taskParents.get(id);
    const seen = new Set([id]);
    while (parent && taskParents.has(parent)) {
      if (seen.has(parent))
        throw new SafeApiFailure(
          "task.order-descendants",
          undefined,
          "hierarchy_cycle",
          "e2e/live.ts#cleanUp",
        );
      seen.add(parent);
      depth++;
      parent = taskParents.get(parent);
    }
    return depth;
  };
  taskEntries.sort((a, b) => taskDepth(b.id) - taskDepth(a.id));
  notes.push({
    kind: "task-cleanup-order",
    status: "descendants-before-parents",
    count: taskEntries.length,
    location: "e2e/live.ts#cleanUp",
  });
  for (let index = 0; index < taskEntries.length; index++) {
    const e = taskEntries[index];
    await perform(e.kind, e.id, async () => {
      const task = await cleanupHttp("task.read-current", () =>
        request.get(`/api/tasks/${e.id}`),
      );
      if (task.workspaceId !== current.workspaceId)
        throw new SafeApiFailure(
          "task.check-workspace",
          undefined,
          "outside_verification_workspace",
          "e2e/live.ts#cleanUp",
        );
      const children = await cleanupHttp(
        "task.discover-current-run-children",
        () =>
          request.get(
            `/api/tasks?workspaceId=${current.workspaceId}&parentId=${task.id}`,
          ),
      );
      for (const child of children)
        if (
          !entries.some((item) => item.kind === "tasks" && item.id === child.id)
        ) {
          const childEntry = {
            kind: "tasks",
            id: child.id,
            workspaceId: current.workspaceId,
          };
          entries.push(childEntry);
          taskEntries.push(childEntry);
        }
      const runs = await cleanupHttp("task.list-runs", () =>
        request.get(`/api/runs?workspaceId=${current.workspaceId}`),
      );
      for (const run of runs.filter(
        (item: any) =>
          item.taskId === task.id &&
          ["running", "paused", "needs_review", "changes_requested"].includes(
            item.status,
          ),
      )) {
        const detail = await cleanupHttp("task.read-active-run", () =>
          request.get(`/api/runs/${run.id}`),
        );
        await cleanupHttp("task.cancel-active-run", () =>
          request.post(`/api/runs/${run.id}/control`, {
            data: { version: detail.run.version, action: "cancel" },
          }),
        );
      }
      let now = await cleanupHttp("task.read-after-cancel", () =>
        request.get(`/api/tasks/${e.id}`),
      );
      // An approved agent task may stay assigned. Rewriting even the same done
      // status would bypass its review gate, so completed tasks remain unchanged.
      if (now.status === "done") {
        notes.push({
          kind: "tasks",
          id: e.id,
          status: "done-retained-unchanged",
          step: "task.keep-already-done",
          location: "e2e/live.ts#cleanUp",
        });
        return;
      }
      const calendar = await cleanupHttp("task.read-calendar", () =>
        request.get(`/api/tasks/${e.id}/calendar`),
      );
      if (calendar.schedule)
        await cleanupHttp("task.clear-current-run-schedule", () =>
          request.patch(`/api/tasks/${e.id}/calendar`, {
            data: { version: calendar.task.version, schedule: null },
          }),
        );
      now = await cleanupHttp("task.read-before-unassign", () =>
        request.get(`/api/tasks/${e.id}`),
      );
      if (now.workerId !== null) {
        // Public REST exposes /assignment; updateTaskWork is MCP-only in this SHA.
        now = await cleanupHttp("task.unassign-worker", () =>
          request.patch(`/api/tasks/${e.id}/assignment`, {
            data: { version: now.version, workerId: null },
          }),
        );
        if (now.workerId !== null)
          throw new SafeApiFailure(
            "task.confirm-unassigned",
            undefined,
            "worker_not_cleared",
            "e2e/live.ts#cleanUp",
          );
      }
      // Never trust an earlier mutation response as the last version snapshot.
      now = await cleanupHttp("task.read-before-mark-done", () =>
        request.get(`/api/tasks/${e.id}`),
      );
      if (now.status !== "done" && now.workerId !== null)
        throw new SafeApiFailure(
          "task.confirm-fresh-unassigned",
          undefined,
          "worker_not_cleared",
          "e2e/live.ts#cleanUp",
        );
      if (now.status !== "done") {
        const remainingChildren = await cleanupHttp(
          "task.confirm-descendants-done",
          () =>
            request.get(
              `/api/tasks?workspaceId=${current.workspaceId}&parentId=${e.id}`,
            ),
        );
        if (remainingChildren.some((child: any) => child.status !== "done"))
          throw new SafeApiFailure(
            "task.confirm-descendants-done",
            undefined,
            "unfinished_descendant",
            "e2e/live.ts#cleanUp",
          );
        const done = await cleanupHttp("task.mark-done-after-unassign", () =>
          request.patch(`/api/tasks/${e.id}`, {
            data: { version: now.version, status: "done" },
          }),
        );
        if (done.status !== "done")
          throw new SafeApiFailure(
            "task.confirm-done",
            undefined,
            "done_not_confirmed",
            "e2e/live.ts#cleanUp",
          );
      }
    });
  }
  // Only journaled current-run mind rows may be changed. Archived history stays.
  for (const e of entries.filter((item) =>
    ["mind-edges", "mind-nodes", "mind-sources"].includes(item.kind),
  )) {
    await perform(e.kind, e.id, async () => {
      const map = await cleanupHttp("mind.read-current-run-map", () =>
        request.get(
          `/api/workspaces/${current.workspaceId}/mind?archived=include`,
        ),
      );
      const list =
        e.kind === "mind-edges"
          ? map.edges
          : e.kind === "mind-nodes"
            ? map.nodes
            : map.sources;
      const item = list.find((row: any) => row.id === e.id);
      if (e.kind === "mind-edges") {
        if (!item) {
          notes.push({
            kind: e.kind,
            id: e.id,
            status: "already-removed",
            step: "mind.edge-already-removed",
          });
          return;
        }
        await cleanupHttp("mind.remove-current-run-edge", () =>
          request.delete(`/api/mind/edges/${e.id}`),
        );
      } else {
        if (!item)
          throw new SafeApiFailure(
            "mind.find-current-run-row",
            undefined,
            "journaled_row_missing",
            "e2e/live.ts#cleanUp",
          );
        if (item.workspaceId !== current.workspaceId)
          throw new SafeApiFailure(
            "mind.check-workspace",
            undefined,
            "outside_verification_workspace",
            "e2e/live.ts#cleanUp",
          );
        if (!item.archivedAt) {
          const kind = e.kind === "mind-nodes" ? "nodes" : "sources";
          const updated = await cleanupHttp(
            "mind.archive-current-run-row",
            () =>
              request.patch(`/api/mind/${kind}/${e.id}`, {
                data: { version: item.version, archived: true },
              }),
          );
          if (!updated.archivedAt)
            throw new SafeApiFailure(
              "mind.confirm-archive",
              undefined,
              "archive_not_confirmed",
              "e2e/live.ts#cleanUp",
            );
        }
      }
    });
  }
  for (const kind of ["contacts", "companies", "projects"])
    for (const e of entries.filter((e) => e.kind === kind))
      await perform(kind, e.id, async () => {
        const data = await checked(
          await request.get(
            kind === "projects"
              ? `/api/projects?workspaceId=${current.workspaceId}`
              : `/api/${kind}/${e.id}`,
          ),
          "archive read",
        );
        const item =
          kind === "projects"
            ? data.find((x: any) => x.id === e.id)
            : kind === "contacts"
              ? (data.contact ?? data)
              : (data.company ?? data);
        if (!item) throw new Error("archive item");
        const archived =
          kind === "projects" ? item.archived : !!item.archivedAt;
        if (!archived) {
          const updated = await checked(
            await request.patch(`/api/${kind}/${e.id}`, {
              data: { version: item.version, archived: true },
            }),
            "archive write",
          );
          if (!(kind === "projects" ? updated.archived : updated.archivedAt))
            throw new Error("archive not confirmed");
        }
      });
  for (const e of entries.filter((e) => e.kind === "invites")) {
    const response = await request.get(
      `/api/workspaces/${e.workspaceId}/invites`,
    );
    if (!response.ok()) {
      failed++;
      notes.push({ kind: e.kind, id: e.id, status: "cleanup-failed" });
      continue;
    }
    const invite = (await response.json()).find(
      (item: any) => item.id === e.id,
    );
    if (invite?.status === "accepted") {
      e.retained = true;
      notes.push({
        kind: e.kind,
        id: e.id,
        status: "retained-accepted-invitation",
        reason: "public revoke rejects accepted invitation with HTTP 409",
      });
      continue;
    }
    await perform(e.kind, e.id, async () => {
      const gone = await request.delete(`/api/workspace-invites/${e.id}`);
      if (gone.status() !== 200) throw new Error("invite revoke failed");
      const value = await gone.json();
      if (value.status !== "revoked")
        throw new Error("invite revoke not confirmed");
    });
  }
  for (const e of entries.filter((e) => e.kind === "recipient-member"))
    await perform(e.kind, e.id, async () => {
      await checked(
        await request.patch(
          `/api/workspaces/${e.workspaceId}/members/${e.id}`,
          { data: { role: "member" } },
        ),
        "restore verification recipient role",
      );
    });
  for (const [id, profile] of current.profiles)
    await perform("agent-settings", id, async () => {
      const currentProfile = await checked(
        await request.get(`/api/agents/${id}`),
        "cleanup agent current",
      );
      for (const grant of currentProfile.grants.filter(
        (g: any) =>
          !profile.grants.some((prior: any) => prior.id === g.id) &&
          ["allowed", "pending"].includes(g.status),
      ))
        await checked(
          await request.post(`/api/grants/${grant.id}/decision`, {
            data: { decision: "revoke" },
          }),
          "cleanup new grant",
        );
      for (const permission of profile.permissions)
        await checked(
          await request.put(`/api/agents/${id}/permissions`, {
            data: {
              capability: permission.capability,
              decision: permission.decision,
            },
          }),
          "restore permission",
        );
      await checked(
        await request.patch(`/api/agents/${id}`, {
          data: {
            supervisorId: profile.supervisorId,
            reviewPolicy: profile.reviewPolicy,
            maxDurationMs: profile.maxDurationMs,
            maxCostMicros: profile.maxCostMicros,
          },
        }),
        "restore review policy",
      );
    });
  if (current.preferences)
    await perform("notification-preferences", "dedicated-account", async () => {
      const latest = await checked(
        await request.get("/api/me/notifications"),
        "notification current",
      );
      await checked(
        await request.patch("/api/me/notifications", {
          data: { ...current.preferences, version: latest.version },
        }),
        "restore notifications",
      );
    });
  if (current.primaryProfile)
    await perform("profile-preferences", "dedicated-account", async () => {
      await checked(
        await request.patch("/api/profile", { data: current.primaryProfile }),
        "restore locale/timezone",
      );
      const me = meSchema.parse(
        await checked(await request.get("/api/me"), "restored profile read"),
      );
      if (
        me.user.locale !== current.primaryProfile!.locale ||
        me.user.tz !== current.primaryProfile!.tz
      )
        throw new Error("profile restore not confirmed");
    });
  for (const [page, theme] of current.themes) {
    if (page.isClosed()) {
      notes.push({
        kind: "browser-theme",
        id: "ephemeral-context",
        status: "closed-context-no-persisted-change",
      });
      continue;
    }
    await perform("browser-theme", "ephemeral-context", async () => {
      const restored = await page.evaluate((value) => {
        if (value === null) localStorage.removeItem("taff-theme");
        else localStorage.setItem("taff-theme", value);
        if (value === "dark" || value === "light")
          document.documentElement.dataset.theme = value;
        else delete document.documentElement.dataset.theme;
        return localStorage.getItem("taff-theme");
      }, theme);
      if (restored !== theme) throw new Error("theme restore not confirmed");
    });
  }
  const dir = process.env.RELEASE_REPORT_DIR ?? "reports";
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(
      dir,
      `entities-${stamp}-${info.project.name}-${info.title.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80)}.json`,
    ),
    JSON.stringify(
      {
        test: info.title,
        project: info.project.name,
        entries: entries.map((e) => ({
          ...e,
          retained:
            !!e.retained ||
            [
              "tasks",
              "workspaces",
              "verification-recipient",
              "recipient-member",
            ].includes(e.kind),
        })),
        cleanup: notes,
        failed,
        pageErrors: current.pageErrors,
        httpFailures: current.httpFailures,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  info.annotations.push({
    type: "check",
    description: `${current.pageErrors === 0 ? "ok" : "fail"}|zero browser page errors`,
  });
  if (failed)
    throw new Error(
      "BLOCKED: supported cleanup incomplete; see entity journal",
    );
  expect(current.pageErrors, "browser pageerror count").toBe(0);
}
export async function inviteRecipient(
  browser: Browser,
  admin: Page,
  workspaceId: string,
  info: TestInfo,
) {
  if (!process.env.TAFF_VERIFY_SSH_TARGET || !process.env.TAFF_VERIFY_API_ID)
    throw new Error(
      "BLOCKED: scoped recipient email-proof helper transport unavailable",
    );
  const context = await browser.newContext({ baseURL: origin });
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    email = `taff-v020-verify-${id}@example.test`,
    password = `Release-pw-${crypto.randomUUID()}`;
  let joined = false;
  try {
    await checked(
      await context.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: { name: `v0.2.0 verification recipient ${id}`, email, password },
      }),
      "recipient signup",
    );
    const after = Date.now();
    const delivery = await checked(
      await context.request.post("/api/me/email-verification/request", {
        data: {},
      }),
      "recipient email-proof request",
    );
    if (delivery.delivery === "sent")
      throw new Error(
        "BLOCKED: recipient proof was sent by SMTP; private fallback evidence unavailable",
      );
    const proofEnvironment = Object.fromEntries(
      [
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "SSH_AUTH_SOCK",
        "TAFF_VERIFY_SSH_TARGET",
        "TAFF_VERIFY_API_ID",
      ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
    );
    const result = await execute(
      "python3",
      [
        new URL("./email-proof.py", import.meta.url).pathname,
        email,
        String(after),
      ],
      { env: proofEnvironment, maxBuffer: 8192, timeout: 30000 },
    );
    let proof: any;
    try {
      proof = JSON.parse(result.stdout);
    } catch {
      throw new Error("BLOCKED: scoped email proof unavailable");
    }
    if (!proof.ok || typeof proof.token !== "string")
      throw new Error(
        "BLOCKED: requested recipient proof absent from private fallback sink",
      );
    await checked(
      await context.request.post("/api/me/email-verification/verify", {
        data: { token: proof.token },
      }),
      "recipient verification",
    );
    proof.token = "";
    const issued = await checked(
      await admin.request.post(`/api/workspaces/${workspaceId}/invites`, {
        data: { email, role: "member" },
      }),
      "recipient invitation",
    );
    // A new browser context has no cached app state; invitation token never enters a journal.
    const page = await context.newPage();
    await page.goto(`/#invite=${encodeURIComponent(issued.token)}`);
    expect(
      await page.evaluate(() => !location.hash.includes("invite=")),
      "invitation fragment removed before acceptance",
    ).toBe(true);
    const invitationNavigation = page.locator('.invite-banner a[href="/orgs"]');
    await expect(invitationNavigation).toBeVisible();
    await invitationNavigation.click();

    await expect(page.getByTestId("accept-invitation")).toBeVisible();
    const accepted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/workspace-invites/accept" &&
        r.request().method() === "POST",
    );
    await page.getByTestId("accept-invitation").click();
    if ((await accepted).status() !== 200)
      throw new Error("BLOCKED: recipient invitation acceptance failed");
    expect(
      await page.evaluate(() => !location.hash.includes("invite=")),
      "invitation fragment removed after acceptance",
    ).toBe(true);
    info.annotations.push({
      type: "check",
      description: "ok|invitation fragment removed before and after acceptance",
    });
    joined = true;
    const me = meSchema.parse(
      await checked(await context.request.get("/api/me"), "recipient identity"),
    );
    const member = memberListSchema
      .parse(
        await checked(
          await admin.request.get(`/api/members?workspaceId=${workspaceId}`),
          "recipient membership",
        ),
      )
      .find((m) => m.userId === me.user.id);
    if (!member)
      throw new Error("BLOCKED: invited verification recipient missing");
    state?.entries.push({ kind: "verification-recipient", id: me.user.id });
    state?.entries.push({
      kind: "recipient-member",
      id: member.id,
      workspaceId,
    });
    info.annotations.push({
      type: "check",
      description:
        "ok|fresh verification recipient invitation accepted in new browser",
    });
    return { member, context };
  } catch {
    if (!joined) await context.close();
    throw new Error(
      "BLOCKED: dedicated recipient signup/email-proof/invitation step unavailable",
    );
  }
}
export const test = base.extend<{ liveSafety: void }>({
  liveSafety: [
    async ({ browser, context, page }, use, info) => {
      state = {
        entries: [],
        pending: [],
        pageErrors: 0,
        httpFailures: [],
        profiles: new Map(),
        themes: new Map(),
      };
      instrument(context);
      watchPage(page);
      const original = browser.newContext.bind(browser);
      (browser as any).newContext = async (...args: any[]) => {
        const next = await original(...args);
        instrument(next);
        return next;
      };
      try {
        await use();
      } finally {
        try {
          await cleanUp(context.request, info);
        } finally {
          // Playwright 1.64 otherwise writes error-context.md containing live DOM/tokens.
          // Preserve error count/status while dropping all raw diagnostic payloads.
          for (const rawError of info.errors) {
            const error = rawError as any;
            if (!error.location) {
              const frames = String(error.stack ?? "")
                .split("\n")
                .filter((line) => line.trim().startsWith("at "));
              const scoped = frames.filter((line) =>
                line.includes("/e2e/live/"),
              );
              for (const frame of [...scoped, ...frames]) {
                const match = frame.match(
                  /(?:\(|\s)([^()\s]+\.(?:ts|tsx|js|mjs|cjs)):(\d+):(\d+)\)?$/,
                );
                if (match) {
                  error.location = {
                    file: basename(match[1]),
                    line: Number(match[2]),
                    column: Number(match[3]),
                  };
                  break;
                }
              }
            }
            if (error.location)
              error.location = {
                file: basename(error.location.file),
                line: error.location.line,
                column: error.location.column,
              };
            delete error.message;
            delete error.stack;
            delete error.value;
            delete error.snippet;
            delete error.cause;
            delete (error as any).errorContext;
          }
          (browser as any).newContext = original;
          state = undefined;
        }
      }
    },
    { auto: true, timeout: 120000 },
  ],
});
