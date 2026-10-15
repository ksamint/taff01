import { readFileSync } from "node:fs";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { McpHumanActions } from "../../../apps/api/scripts/mcp-round-trip";
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
} from "../../../packages/schemas/src/index";
import { messages } from "../../support/messages";
import { inviteRecipient, liveSignIn, verificationAgent } from "../live";

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

export type ReleaseLocale = "en" | "zh-HK" | "zh-CN";
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
 * Signs in with the existing verification account, saves
 * the project language and opens Today. Each test owns its account, so the
 * checklist never touches anyone else's data.
 */
export async function freshSignedIn(
  page: Page,
  info: TestInfo,
  label = info.title,
) {
  const { locale, m } = meta(info);
  const { account, me, workspace } = await liveSignIn(page, locale);
  return { account, me, workspace };
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
  return verificationAgent(page, workspaceId);
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
  return inviteRecipient(browser, admin, workspaceId, info);
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
