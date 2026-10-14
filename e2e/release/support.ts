import { readFileSync } from "node:fs";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { McpHumanActions } from "../../apps/api/scripts/mcp-round-trip";
import {
  agentProfileSchema,
  companySchema,
  contactSchema,
  issuedAgentTokenSchema,
  issuedWorkspaceInviteSchema,
  type Me,
  type Member,
  mcpCallListSchema,
  memberListSchema,
  meSchema,
  reviewWorkspaceSchema,
  runSchema,
  suggestionSchema,
  timelineSchema,
} from "../../packages/schemas/src/index";
import { messages } from "../support/messages";

/** The origin under test: a local production-mode stack or the live site. */
export const baseURL = (
  process.env.RELEASE_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
export const demo =
  process.env.RELEASE_DEMO_EMAIL && process.env.RELEASE_DEMO_PASSWORD
    ? {
        email: process.env.RELEASE_DEMO_EMAIL,
        password: process.env.RELEASE_DEMO_PASSWORD,
      }
    : null;
/** JSONL mail log of a local stack (EMAIL_LOG_PATH); never set for live. */
export const mailLog = process.env.RELEASE_MAIL_LOG;
export const rateLimit = Number(
  process.env.RELEASE_MCP_RATE_LIMIT ?? process.env.MCP_RATE_LIMIT ?? 60,
);

export type ReleaseLocale = "en" | "zh-HK";
export type FormFactor = "phone" | "desktop";
export function meta(info: TestInfo) {
  const { locale, formFactor } = info.project.metadata as {
    locale: ReleaseLocale;
    formFactor: FormFactor;
  };
  return {
    locale,
    formFactor,
    m: messages[locale],
    desktop: formFactor === "desktop",
  };
}

/** Records a sub-step that could not run here, with the reason, in the report. */
export function skipStep(info: TestInfo, reason: string) {
  info.annotations.push({ type: "skipped-step", description: reason });
  console.log(`[${info.project.name}] step skipped: ${reason}`);
}

/** Records a named check in the report; never pass secrets in `name`. */
export function recordCheck(info: TestInfo, name: string, ok: boolean) {
  info.annotations.push({
    type: "check",
    description: `${ok ? "ok" : "fail"}|${name}`,
  });
}

export const unique = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 12);
/** A throwaway password for this run's fresh accounts; never printed. */
export const newPassword = () => `Release-pw-${crypto.randomUUID()}`;

export type Account = {
  email: string;
  password: string;
  username?: string;
  name: string;
};
export function newAccount(label: string, withUsername = false): Account {
  const id = unique();
  return {
    email: `release-${id}@example.test`,
    password: newPassword(),
    name: `R1 ${label} ${id.slice(0, 6)}`,
    ...(withUsername ? { username: `r1_${id}` } : {}),
  };
}

export async function readMe(request: APIRequestContext) {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(200);
  return meSchema.parse(await response.json());
}

/** Better Auth rate-limits auth routes per client; retry after a 429. */
async function authPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
) {
  for (let attempt = 0; ; attempt++) {
    const response = await request.post(path, {
      headers: { Origin: baseURL },
      data,
    });
    if (response.status() !== 429 || attempt >= 6) return response;
    const retry = Number(response.headers()["x-retry-after"] ?? 5);
    await new Promise((done) =>
      setTimeout(done, Math.min(Math.max(retry, 1), 15) * 1000),
    );
  }
}

/** Saves the profile language with the browser's own time zone. */
export async function saveLocale(page: Page, locale: string) {
  const tz = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const response = await page.request.patch("/api/profile", {
    data: { locale, tz },
  });
  expect(response.status()).toBe(200);
}

/**
 * Signs up a fresh account through the API (item 1 covers the form), saves
 * the project language and opens Today. Each test owns its account, so the
 * checklist never touches anyone else's data.
 */
export async function freshSignedIn(
  page: Page,
  info: TestInfo,
  label = info.title,
) {
  const { locale, m } = meta(info);
  const account = newAccount(label.slice(0, 20));
  const response = await authPost(page.request, "/api/auth/sign-up/email", {
    name: account.name,
    email: account.email,
    password: account.password,
  });
  expect(response.status(), "fresh sign-up").toBe(200);
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await saveLocale(page, locale);
  await page.reload();
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  const me = await readMe(page.request);
  return { account, me, workspace: me.workspaces[0] };
}

export async function signInApi(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await authPost(request, "/api/auth/sign-in/email", {
    email,
    password,
  });
  expect(response.status(), "sign-in").toBe(200);
}

export async function listMembers(
  request: APIRequestContext,
  workspaceId: string,
) {
  const response = await request.get(`/api/members?workspaceId=${workspaceId}`);
  expect(response.status()).toBe(200);
  return memberListSchema.parse(await response.json());
}

/** Adds an agent through Team › Add agent, as e2e/agent-creation.spec.ts does. */
export async function addAgentViaTeam(page: Page, workspaceId: string) {
  await page.goto("/orgs#team");
  await expect(page.getByTestId("team-add-agent")).toBeEnabled();
  await page.getByTestId("team-add-agent").click();
  const name = `R1 agent ${unique()}`;
  await page.getByTestId("agent-name").fill(name);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/workspaces/${workspaceId}/members` &&
      response.request().method() === "POST",
  );
  await page.getByTestId("agent-create").click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const agent = (await listMembers(page.request, workspaceId)).find(
    (member) => member.kind === "agent" && member.name === name,
  );
  if (!agent) throw new Error("The new agent is missing from Team");
  await expect(
    page.locator(`.team-agent-link[href="/agents/${agent.id}"]`),
  ).toContainText(name);
  return agent;
}

/** A verification link from a local stack's mail log, if one is configured. */
async function verificationLinkFromLog(email: string, after: number) {
  if (!mailLog) return null;
  for (let i = 0; i < 40; i++) {
    let lines: string[] = [];
    try {
      lines = readFileSync(mailLog, "utf8").trim().split("\n");
    } catch {}
    for (const line of lines.reverse()) {
      const message = JSON.parse(line || "{}") as {
        to?: string;
        text?: string;
        createdAt?: string;
      };
      if (
        message.to === email &&
        Date.parse(message.createdAt ?? "") >= after - 1000
      ) {
        const link = message.text
          ?.split("\n")
          .find((entry) => entry.includes("#verifyEmail="));
        if (link) return link.trim();
      }
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  return null;
}

/**
 * Brings a second person into the workspace so owner and role changes have
 * someone to pick. A fresh account verifies its email from a local stack's
 * mail log (RELEASE_MAIL_LOG); otherwise the provided demo/verification
 * account (RELEASE_DEMO_EMAIL/PASSWORD) accepts the invitation. Returns null,
 * with the reason recorded, when neither is available.
 */
export async function secondPerson(
  browser: Browser,
  admin: Page,
  workspaceId: string,
  info: TestInfo,
  why: string,
): Promise<{ member: Member; context: BrowserContext } | null> {
  if (!mailLog && !demo) {
    skipStep(
      info,
      `${why}: needs a second verified person; set RELEASE_MAIL_LOG (local stack) or RELEASE_DEMO_EMAIL/RELEASE_DEMO_PASSWORD`,
    );
    return null;
  }
  const context = await browser.newContext({ baseURL });
  const request = context.request;
  let email: string;
  let me: Me;
  if (mailLog) {
    const account = newAccount("second");
    email = account.email;
    const signed = await authPost(request, "/api/auth/sign-up/email", {
      name: account.name,
      email,
      password: account.password,
    });
    expect(signed.status(), "second person sign-up").toBe(200);
    const asked = Date.now();
    const requested = await request.post("/api/me/email-verification/request", {
      data: {},
    });
    expect(requested.status(), "verification request").toBe(200);
    const link = await verificationLinkFromLog(email, asked);
    if (!link) throw new Error("No verification link in RELEASE_MAIL_LOG");
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
      "verifyEmail",
    );
    const verified = await request.post("/api/me/email-verification/verify", {
      data: { token },
    });
    expect(verified.status(), "email verification").toBe(200);
  } else {
    email = demo!.email;
    await signInApi(request, demo!.email, demo!.password);
    const verification = await request.get("/api/me/email-verification");
    expect(verification.status()).toBe(200);
    if (!(await verification.json()).emailVerified) {
      await context.close();
      skipStep(
        info,
        `${why}: the RELEASE_DEMO_EMAIL account has no verified email, so it cannot accept invitations`,
      );
      return null;
    }
  }
  me = await readMe(request);
  const issued = await admin.request.post(
    `/api/workspaces/${workspaceId}/invites`,
    { data: { email, role: "member" } },
  );
  expect(issued.status(), "invitation").toBe(201);
  const invite = issuedWorkspaceInviteSchema.parse(await issued.json());
  const accepted = await request.post("/api/workspace-invites/accept", {
    data: { token: invite.token },
  });
  expect(accepted.status(), "invitation acceptance").toBe(200);
  const member = (await listMembers(admin.request, workspaceId)).find(
    (item) => item.userId === me.user.id,
  );
  if (!member) throw new Error("The second person did not join");
  return { member, context };
}

/** The person's side of the MCP round trip, over the signed-in HTTP session. */
export function httpHuman(
  request: APIRequestContext,
  workspaceId: string,
): McpHumanActions {
  const json = async (
    response: Awaited<ReturnType<APIRequestContext["get"]>>,
    label: string,
  ) => {
    expect(response.ok(), `${label} (${response.status()})`).toBe(true);
    return response.json();
  };
  return {
    decideGrant: async (id, data) =>
      json(
        await request.post(`/api/grants/${id}/decision`, { data }),
        "grant decision",
      ),
    getAgentProfile: async (id) =>
      agentProfileSchema.parse(
        await json(await request.get(`/api/agents/${id}`), "agent profile"),
      ),
    setAgentPermission: async (id, data) =>
      json(
        await request.put(`/api/agents/${id}/permissions`, { data }),
        "agent permission",
      ),
    reviewRun: async (id, data) =>
      runSchema.parse(
        await json(
          await request.post(`/api/runs/${id}/review`, { data }),
          "review",
        ),
      ),
    getReview: async (taskId) =>
      reviewWorkspaceSchema.parse(
        await json(
          await request.get(`/api/tasks/${taskId}/review`),
          "review read",
        ),
      ),
    createCompany: async (data) =>
      companySchema.parse(
        await json(
          await request.post(`/api/companies?workspaceId=${workspaceId}`, {
            data,
          }),
          "company",
        ),
      ),
    createContact: async (data) =>
      contactSchema.parse(
        await json(
          await request.post(`/api/contacts?workspaceId=${workspaceId}`, {
            data,
          }),
          "contact",
        ),
      ),
    archiveContact: async ({ id, version }) =>
      json(
        await request.patch(`/api/contacts/${id}`, {
          data: { version, archived: true },
        }),
        "contact archive",
      ),
    archiveCompany: async ({ id, version }) =>
      json(
        await request.patch(`/api/companies/${id}`, {
          data: { version, archived: true },
        }),
        "company archive",
      ),
    createAgentToken: async (data) =>
      issuedAgentTokenSchema.parse(
        await json(await request.post("/api/agent-tokens", { data }), "token"),
      ),
    revokeAgentToken: async (id) =>
      json(await request.delete(`/api/agent-tokens/${id}`), "token revoke"),
    listMcpCalls: async () =>
      mcpCallListSchema.parse(
        await json(
          await request.get(`/api/mcp-calls?workspaceId=${workspaceId}`),
          "call log",
        ),
      ),
    getTimeline: async (projectId) =>
      timelineSchema.parse(
        await json(
          await request.get(`/api/projects/${projectId}/timeline`),
          "timeline",
        ),
      ),
    dismissSuggestion: async (id, data) =>
      suggestionSchema.parse(
        await json(
          await request.post(`/api/suggestions/${id}/dismiss`, { data }),
          "suggestion dismissal",
        ),
      ),
  };
}

/** Opens the Me screen where language, theme and sign-out live. */
export async function openMeSettings(page: Page, desktop: boolean) {
  await page.goto(desktop ? "/me?tab=settings" : "/me");
  await expect(page.getByTestId("locale-select")).toBeVisible();
}

export function waitForApi(page: Page, method: string, path: string | RegExp) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      (typeof path === "string"
        ? new URL(response.url()).pathname === path
        : path.test(new URL(response.url()).pathname)),
  );
}
