import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createCore, userPrincipal } from "@taff/core";
import {
  agentPermissions,
  connectDatabase,
  members,
  notificationPreferences,
  tasks,
  user,
} from "@taff/db";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MCP_TOOLS,
  ROUND_TRIP_SCOPES,
} from "../../../apps/api/scripts/mcp-round-trip";
import { createApp } from "../../../apps/api/src/app";
import { migrateDatabase } from "../../db/src/migrate";
import { canonicalJson } from "./trusted-review";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("Authorization matrix requires an isolated _test database");
const pino = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("pino");
const origin = "http://localhost:3000";
type Actor = "owner" | "member" | "agent" | "other-workspace";
const actors: Actor[] = ["owner", "member", "agent", "other-workspace"];
type RequestCase = {
  method: string;
  path: string;
  body?: (f: Fixture) => unknown;
  member?: "deny";
  allowedStatus?: number[];
  foreign?: "own-workspace";
  prepare?: (f: Fixture) => Promise<void>;
};
let core: ReturnType<typeof createCore>;
let app: ReturnType<typeof createApp>;
let connection: ReturnType<typeof connectDatabase>;
let workspaceId: string;
let ownerId: string;
let ownerUserId: string;
let memberId: string;
let agentId: string;
let agentToken: string;
let foreignAgentToken: string;
let digestId: string;
let cookies: Record<Exclude<Actor, "agent">, string>;
const owner = () => userPrincipal(ownerUserId);
const authSecret = `authorization-matrix-${randomUUID()}`;
const approvalKey = `matrix-approval-${randomUUID()}`;
const mappings: {
  controllerId: string;
  workspaceId: string;
  userId: string;
  verifiedByUserId: string;
}[] = [];
const signedRoutes = [
  "/api/approved-operations",
  "/api/approved-operations/status",
  "/api/trusted-reviews",
  "/api/trusted-reviews/status",
];
const messages: { to: string; text: string }[] = [];
const delivered = new Map<string, string>();
const organizationRoutes = [
  ["PATCH", "/api/users/:id/default-workspace"],
  ["GET", "/api/admin/workspaces"],
  ["DELETE", "/api/workspaces/:id"],
] as const;
const lifecycleRoutes = [
  ["GET", "/api/health"],
  ["GET", "/api/auth/methods"],
  ["POST", "/api/auth/phone-number/send-otp"],
  ["POST", "/api/auth/phone-number/verify"],
  ["POST", "/api/auth/sign-in/email"],
  ["POST", "/api/auth/sign-in/username"],
  ["POST", "/api/auth/sign-in/phone-number"],
  ["POST", "/api/auth/sign-up/email"],
  ["POST", "/api/auth/sign-out"],
  ["POST", "/api/me/email-verification/request"],
  ["POST", "/api/me/email-verification/verify"],
  ["POST", "/api/workspace-invites/accept"],
] as const;
const oauthMetadataRoutes = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
] as const;
function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
async function signup(name: string) {
  const password = `test-${randomUUID()}`;
  const username = `u${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const email = `${randomUUID()}@test.local`;
  const result = await core.auth.api.signUpEmail({
    body: { name, email, password, username },
  });
  const response = await core.auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return {
    id: result.user.id,
    email,
    username,
    password,
    cookie: sessionCookie(response),
  };
}
let people: Record<Exclude<Actor, "agent">, Awaited<ReturnType<typeof signup>>>;

async function fixture() {
  const project = await core.createProject(owner(), workspaceId, {
    name: `Matrix ${randomUUID()}`,
  });
  const task = await core.createTask(owner(), {
    workspaceId,
    ownerId,
    workerId: agentId,
    projectId: project.id,
    title: "Matrix task",
  });
  const predecessor = await core.createTask(owner(), {
    workspaceId,
    ownerId,
    workerId: agentId,
    projectId: project.id,
    title: "Predecessor",
  });
  const company = await core.createCompany(owner(), workspaceId, {
    name: "Matrix company",
  });
  const contact = await core.createContact(owner(), workspaceId, {
    name: "Matrix contact",
    companyId: company.id,
  });
  const milestone = await core.createMilestone(owner(), project.id, {
    name: "Matrix milestone",
    date: "2026-10-20",
  });
  const node = await core.createMindNode(owner(), workspaceId, {
    title: "Matrix node",
    layer: 0,
    angle: 0,
  });
  const otherNode = await core.createMindNode(owner(), workspaceId, {
    title: "Other node",
    layer: 1,
    angle: 60,
  });
  const edge = await core.createMindEdge(owner(), workspaceId, {
    fromNodeId: node.id,
    toNodeId: otherNode.id,
  });
  const source = await core.createMindSource(owner(), workspaceId, {
    title: "Matrix source",
  });
  await core.linkMindSource(owner(), node.id, source.id);
  const dependency = await core.addDependency(owner(), {
    predecessorTaskId: predecessor.id,
    successorTaskId: task.id,
  });
  const suggestion = await core.createSuggestion(owner(), {
    taskId: task.id,
    kind: "split",
    payload: { subtasks: [{ title: "Child" }] },
  });
  const invite = await core.createWorkspaceInvite(owner(), workspaceId, {
    email: `${randomUUID()}@test.local`,
    role: "member",
  });
  const token = await core.createAgentToken(owner(), {
    workspaceId,
    memberId: agentId,
    name: "Matrix fixture",
    scopes: [...ROUND_TRIP_SCOPES],
  });
  return {
    project,
    task,
    predecessor,
    company,
    contact,
    milestone,
    node,
    otherNode,
    edge,
    source,
    dependency,
    suggestion,
    invite,
    token,
    run: undefined as Awaited<ReturnType<typeof core.startRun>> | undefined,
    grantId: "",
    inboxId: "",
    artifactIds: [] as string[],
    crmUndo: undefined as
      | Awaited<ReturnType<typeof core.setContactRoles>>["undo"]
      | undefined,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function running(f: Fixture) {
  f.run = await core.startRun(owner(), f.task.id, {});
}
async function review(f: Fixture) {
  await running(f);
  await core.attachRunArtifact(owner(), f.run!.id, {
    version: f.run!.version,
    name: "matrix.txt",
    mimeType: "text/plain",
    content: "Matrix output",
    diff: null,
    sourceUrl: null,
  });
  const detail = await core.getRun(owner(), f.run!.id);
  f.run = detail.run;
  f.artifactIds = detail.artifacts.map((artifact) => artifact.id);
  f.run = await core.submitRun(owner(), f.run.id, {
    version: f.run.version,
    summary: "Matrix review",
    requestReview: true,
  });
  f.inboxId = (await core.listInbox(owner(), workspaceId)).items.find(
    (item) => item.taskId === f.task.id,
  )!.id;
}

const routes: RequestCase[] = [
  {
    method: "GET",
    path: "/api/admin/audit/search?workspaceId=:workspace",
    member: "deny",
  },
  {
    method: "GET",
    path: "/api/admin/audit/trace/:trace?workspaceId=:workspace",
    member: "deny",
  },
  {
    method: "GET",
    path: "/api/admin/integrations/permissions?workspaceId=:workspace&tokenId=:token",
    member: "deny",
  },
  { method: "GET", path: "/api/digests/:digest", member: "deny" },
  {
    method: "GET",
    path: "/api/realtime?workspaceId=:workspace",
    allowedStatus: [503],
  },
  {
    method: "POST",
    path: "/api/ask",
    body: () => ({ workspaceId, question: "What is at risk?" }),
  },
  {
    method: "POST",
    path: "/api/crm/undo",
    prepare: async (f) => {
      f.crmUndo = (
        await core.setContactRoles(owner(), "task", f.task.id, f.contact.id, {
          roles: ["ops"],
        })
      ).undo;
    },
    body: (f) => f.crmUndo,
  },
  ...[
    "members",
    "tasks",
    "projects",
    "runs",
    "inbox",
    "agent-tokens",
    "mcp-calls",
    "digests",
    "companies",
    "contacts",
  ].map((name) => ({
    method: "GET",
    path: `/api/${name}?workspaceId=:workspace`,
    ...(name === "mcp-calls" ? { member: "deny" as const } : {}),
  })),
  {
    method: "GET",
    path: "/api/calendar?workspaceId=:workspace&from=2026-10-16T00:00:00Z&to=2026-10-23T00:00:00Z",
  },
  {
    method: "GET",
    path: "/api/bootstrap/today?workspaceId=:workspace",
    foreign: "own-workspace",
  },
  ...["", "/access", "/calendar", "/comments", "/review", "/contacts"].map(
    (suffix) => ({
      method: "GET",
      path: `/api/tasks/:task${suffix}`,
      ...(suffix === "/review" ? { prepare: review } : {}),
    }),
  ),
  // Members read payments (ADR 0021); recording one stays admin-only below.
  ...["/timeline", "/milestones", "/payments", "/contacts"].map((suffix) => ({
    method: "GET",
    path: `/api/projects/:project${suffix}`,
  })),
  ...[
    "/access",
    "/invites",
    "/crm/audit",
    "/crm/search?q=Matrix",
    "/graph",
    "/mind",
    "/suggestions",
    "/ai",
  ].map((suffix) => ({
    method: "GET",
    path: `/api/workspaces/:workspace${suffix}`,
    ...(["/invites", "/crm/audit"].includes(suffix)
      ? { member: "deny" as const }
      : {}),
  })),
  { method: "GET", path: "/api/companies/:company" },
  { method: "GET", path: "/api/companies/:company/contacts" },
  { method: "GET", path: "/api/contacts/:contact" },
  { method: "GET", path: "/api/agents/:agent" },
  { method: "GET", path: "/api/runs/:run", prepare: running },
  { method: "GET", path: "/api/brief?scope=workspace&workspaceId=:workspace" },
  {
    method: "POST",
    path: "/api/search?workspaceId=:workspace",
    body: () => ({ query: "Matrix" }),
  },
  {
    method: "POST",
    path: "/api/quick-add/parse?workspaceId=:workspace",
    body: () => ({ text: "Matrix tomorrow" }),
  },
  {
    method: "POST",
    path: "/api/tasks",
    body: () => ({
      workspaceId,
      ownerId,
      workerId: null,
      title: "Created by matrix",
    }),
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task",
    body: (f) => ({ version: f.task.version, title: "Edited" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task/assignment",
    body: () => ({ workerId: null }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task/status",
    body: () => ({ status: "in_progress" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task/schedule",
    body: () => ({ dueAt: "2026-10-20T00:00:00Z" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task/calendar",
    body: (f) => ({ version: f.task.version, schedule: null }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/tasks/:task/plan",
    body: () => ({ startDate: "2026-10-20", durationDays: 2 }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/tasks/:task/comments",
    body: () => ({ body: "Matrix comment" }),
  },
  {
    method: "POST",
    path: "/api/projects?workspaceId=:workspace",
    body: () => ({ name: "Matrix project" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/projects/:project",
    body: () => ({ version: 1, name: "Edited project" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/workspaces/:workspace/invites",
    body: () => ({ email: `${randomUUID()}@test.local`, role: "member" }),
    member: "deny",
  },
  { method: "DELETE", path: "/api/workspace-invites/:invite", member: "deny" },
  {
    method: "POST",
    path: "/api/workspaces/:workspace/members",
    body: () => ({ name: `Matrix agent ${randomUUID()}`, kind: "agent" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/workspaces/:workspace/members/:member",
    body: () => ({ role: "member" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/tasks/:task/runs",
    body: () => ({}),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/control",
    prepare: running,
    body: (f) => ({ version: f.run!.version, action: "pause" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/events",
    prepare: running,
    body: (f) => ({
      version: f.run!.version,
      kind: "step",
      title: "Matrix step",
    }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/artifacts",
    prepare: running,
    body: (f) => ({
      version: f.run!.version,
      name: "matrix.txt",
      mimeType: "text/plain",
      content: "Matrix",
      diff: null,
      sourceUrl: null,
    }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/submit",
    prepare: async (f) => {
      await running(f);
      await core.attachRunArtifact(owner(), f.run!.id, {
        version: f.run!.version,
        name: "matrix.txt",
        mimeType: "text/plain",
        content: "Matrix",
        diff: null,
        sourceUrl: null,
      });
      f.run = (await core.getRun(owner(), f.run!.id)).run;
    },
    body: (f) => ({ version: f.run!.version, summary: "Matrix submitted" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/review",
    prepare: review,
    body: (f) => ({
      version: f.run!.version,
      decision: "approve",
      items: f.artifactIds.map((artifactId) => ({
        artifactId,
        decision: "approve",
      })),
      checks: {
        matchesDescription: true,
        verifiable: true,
        withinPermissions: true,
      },
    }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/runs/:run/comments",
    prepare: review,
    body: (f) => ({ version: f.run!.version, body: "Matrix review comment" }),
  },
  {
    method: "PATCH",
    path: "/api/inbox/:inbox",
    prepare: review,
    body: () => ({ read: true }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/agents/:agent",
    body: () => ({ supervisorId: ownerId, reviewPolicy: "always_review" }),
    member: "deny",
  },
  {
    method: "PUT",
    path: "/api/agents/:agent/permissions",
    body: () => ({ capability: "repo.read", decision: "ask" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/agents/:agent/grants",
    body: (f) => ({
      taskId: f.task.id,
      capability: "repo.read",
      reason: "Matrix grant",
    }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/grants/:grant/decision",
    prepare: async (f) => {
      f.grantId = (
        await core.requestGrant(owner(), agentId, {
          taskId: f.task.id,
          capability: "repo.read",
          reason: "Matrix decision",
        })
      ).id;
    },
    body: () => ({ decision: "deny" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/agent-tokens",
    body: () => ({
      workspaceId,
      memberId: agentId,
      name: "Matrix token",
      scopes: ["tasks:read"],
    }),
    member: "deny",
  },
  {
    method: "GET",
    path: "/api/agent-tokens/:token/workspaces?workspaceId=:workspace",
    member: "deny",
  },
  {
    method: "PUT",
    path: "/api/agent-tokens/:token/workspaces",
    member: "deny",
    body: () => ({ workspaceId, memberId: agentId, scopes: ["tasks:read"] }),
  },
  { method: "DELETE", path: "/api/agent-tokens/:token", member: "deny" },
  {
    method: "POST",
    path: "/api/agent-tokens/:token/restore",
    prepare: async (f) => {
      await core.revokeAgentToken(owner(), f.token.id);
    },
    member: "deny",
  },
  ...["companies", "contacts"].flatMap((name) => {
    const entity = name === "companies" ? "company" : "contact";
    return [
      {
        method: "POST",
        path: `/api/${name}?workspaceId=:workspace`,
        body: () => ({ name: "Matrix created" }),
      },
      {
        method: "PATCH",
        path: `/api/${name}/:${entity}`,
        body: () => ({ version: 1, name: "Matrix updated" }),
      },
      {
        method: "DELETE",
        path: `/api/${name}/:${entity}?version=1`,
        member: "deny" as const,
      },
    ];
  }),
  {
    method: "PATCH",
    path: "/api/contacts/:contact/company",
    body: () => ({ version: 1, companyId: null }),
  },
  ...["companies", "projects", "tasks"].flatMap((scope) => {
    const entity =
      scope === "companies"
        ? "company"
        : scope === "projects"
          ? "project"
          : "task";
    return [
      {
        method: "PUT",
        path: `/api/${scope}/:${entity}/contacts/:contact`,
        body: () => ({ roles: ["ops"] }),
      },
      {
        method: "DELETE",
        path: `/api/${scope}/:${entity}/contacts/:contact`,
        prepare: async (f: Fixture) => {
          await core.setContactRoles(
            owner(),
            entity as "company" | "project" | "task",
            f[entity].id,
            f.contact.id,
            { roles: ["ops"] },
          );
        },
      },
    ];
  }),
  {
    method: "POST",
    path: "/api/projects/:project/milestones",
    body: () => ({ name: "Matrix milestone", date: "2026-10-20" }),
    member: "deny",
  },
  {
    method: "PATCH",
    path: "/api/milestones/:milestone",
    body: () => ({ version: 1, name: "Updated milestone" }),
    member: "deny",
  },
  {
    method: "DELETE",
    path: "/api/milestones/:milestone?version=1",
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/projects/:project/payments",
    body: () => ({ amount: "1.00", paidOn: "2026-10-16" }),
    member: "deny",
  },
  {
    method: "POST",
    path: "/api/dependencies",
    body: (f) => ({
      predecessorTaskId: f.task.id,
      successorMilestoneId: f.milestone.id,
    }),
    member: "deny",
  },
  { method: "DELETE", path: "/api/dependencies/:dependency", member: "deny" },
  {
    method: "POST",
    path: "/api/workspaces/:workspace/mind/nodes",
    body: () => ({ title: "New node", layer: 0, angle: 0 }),
  },
  {
    method: "PATCH",
    path: "/api/mind/nodes/:node",
    body: () => ({ version: 1, title: "Edited node" }),
  },
  {
    method: "POST",
    path: "/api/mind/nodes/:node/task",
    body: () => ({
      version: 1,
      dueDate: "2026-10-20",
      title: "Validation task",
    }),
  },
  {
    method: "PUT",
    path: "/api/mind/nodes/:node/sources/:source",
    prepare: async (f) => {
      await core.unlinkMindSource(owner(), f.node.id, f.source.id);
    },
  },
  { method: "DELETE", path: "/api/mind/nodes/:node/sources/:source" },
  {
    method: "POST",
    path: "/api/workspaces/:workspace/mind/edges",
    prepare: async (f) => {
      await core.removeMindEdge(owner(), f.edge.id);
    },
    body: (f) => ({
      fromNodeId: f.node.id,
      toNodeId: f.otherNode.id,
      kind: "supports",
    }),
  },
  {
    method: "PATCH",
    path: "/api/mind/edges/:edge",
    body: () => ({ version: 1, kind: "supports" }),
  },
  { method: "DELETE", path: "/api/mind/edges/:edge" },
  {
    method: "POST",
    path: "/api/workspaces/:workspace/mind/sources",
    body: () => ({ title: "New source" }),
  },
  {
    method: "PATCH",
    path: "/api/mind/sources/:source",
    body: () => ({ version: 1, title: "Edited source" }),
  },
  {
    method: "POST",
    path: "/api/suggestions",
    body: (f) => ({
      taskId: f.task.id,
      kind: "split",
      payload: { subtasks: [{ title: "Child" }] },
    }),
    member: "deny",
  },
  ...["apply", "dismiss", "undo"].map((action) => ({
    method: "POST",
    path: `/api/suggestions/:suggestion/${action}`,
    body: () => ({ version: action === "undo" ? 2 : 1 }),
    member: "deny" as const,
    ...(action === "undo"
      ? {
          prepare: async (f: Fixture) => {
            await core.applySuggestion(owner(), f.suggestion.id, {
              version: 1,
            });
          },
        }
      : {}),
  })),
  {
    method: "PATCH",
    path: "/api/workspaces/:workspace/ai",
    body: () => ({ enabled: false }),
    member: "deny",
  },
];

function pathFor(path: string, f: Fixture) {
  const ids: Record<string, string> = {
    trace: "a".repeat(32),
    workspace: workspaceId,
    digest: digestId,
    owner: ownerId,
    member: memberId,
    agent: agentId,
    run: f.run?.id ?? "",
    grant: f.grantId,
    inbox: f.inboxId,
  };
  for (const [name, value] of Object.entries(f))
    if (value && typeof value === "object" && "id" in value)
      ids[name] = value.id;
  return path.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    if (!ids[name]) throw new Error(`Missing fixture ${name}`);
    return ids[name];
  });
}

// Cookie sessions identify people; agent bearer tokens are MCP-only. No core
// methods, sessions, permissions, or database operations are mocked.
describe.skipIf(!databaseUrl)(
  "REST authorization matrix against PostgreSQL",
  () => {
    beforeAll(async () => {
      await migrateDatabase(databaseUrl!);
      connection = connectDatabase(databaseUrl!);
      core = createCore({
        databaseUrl: databaseUrl!,
        authUrl: origin,
        authSecret,
        trustedReview: { key: approvalKey, mappings },
        email: {
          send: async (message) => {
            messages.push(message);
            return "logged";
          },
        },
        sms: {
          sendOTP: async ({ phoneNumber, code }) => {
            delivered.set(phoneNumber, code);
          },
        },
        tokenPepper: "authorization-matrix-pepper-16-chars",
      });
      app = createApp(core, origin, pino({ enabled: false }), {
        limit: 10000,
        hit: async () => ({ allowed: true, count: 1 }),
        close: async () => {},
      });
      const a = await signup("Matrix owner");
      const b = await signup("Matrix member");
      const c = await signup("Matrix other workspace");
      people = { owner: a, member: b, "other-workspace": c };
      ownerUserId = a.id;
      const workspace = (await core.getMe(a.id)).workspaces[0];
      workspaceId = workspace.id;
      ownerId = workspace.memberId;
      cookies = {
        owner: a.cookie,
        member: b.cookie,
        "other-workspace": c.cookie,
      };
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${a.id}, true)`,
        );
        const [member] = await tx
          .insert(members)
          .values({
            workspaceId,
            userId: b.id,
            name: "Matrix member",
            kind: "person",
            role: "member",
          })
          .returning();
        memberId = member.id;
      });
      const agent = await core.createWorkspaceAgent(owner(), workspaceId, {
        name: "Matrix agent",
        kind: "agent",
      });
      agentId = agent.id;
      agentToken = (
        await core.createAgentToken(owner(), {
          workspaceId,
          memberId: agentId,
          name: "Matrix bearer",
          scopes: [...ROUND_TRIP_SCOPES],
        })
      ).token;
      for (const capability of [
        "crm.read",
        "files.attach",
        "projects.manage",
      ] as const)
        await core.setAgentPermission(owner(), agentId, {
          capability,
          decision: "allow",
        });
      const foreignWorkspace = (await core.getMe(c.id)).workspaces[0];
      const foreignAgent = await core.createWorkspaceAgent(
        userPrincipal(c.id),
        foreignWorkspace.id,
        { name: "Foreign matrix agent", kind: "agent" },
      );
      await core.setAgentPermission(userPrincipal(c.id), foreignAgent.id, {
        capability: "crm.read",
        decision: "allow",
      });
      await core.setAgentPermission(userPrincipal(c.id), foreignAgent.id, {
        capability: "projects.manage",
        decision: "allow",
      });
      foreignAgentToken = (
        await core.createAgentToken(userPrincipal(c.id), {
          workspaceId: foreignWorkspace.id,
          memberId: foreignAgent.id,
          name: "Foreign matrix bearer",
          scopes: [...ROUND_TRIP_SCOPES],
        })
      ).token;
      // Put this isolated account after its daily slot without mocking clocks.
      const offset = new Date().getUTCHours() - 12;
      const tz =
        offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "+" : ""}${offset}`;
      await core.updateProfile(ownerUserId, { locale: "en", tz });
      const scheduledAt = new Date(Date.now() - 60_000).toISOString();
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${ownerUserId}, true)`,
        );
        await tx
          .update(notificationPreferences)
          .set({ nextDigestAt: new Date(scheduledAt) })
          .where(eq(notificationPreferences.id, ownerUserId));
      });
      const preferences = await core.getNotificationPreferences(owner());
      const generated = await core.generateDailyDigest(
        ownerUserId,
        scheduledAt,
        preferences.version,
      );
      expect(generated.status).toBe("generated");
      digestId = generated.digestIds[0];
    }, 30000);
    afterAll(async () => {
      await core?.close();
      await connection?.close();
    });

    function agentEnvelope(f: Fixture, token: string) {
      const operation_json = JSON.stringify({
        version: 1,
        audience: "taff_agent",
        issuer: "twin",
        source: "private_wechat",
        receipt_id: randomUUID(),
        controller_id: "matrix-controller",
        workspace_id: workspaceId,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        tool: "tasks.edit",
        arguments: {
          taskId: f.task.id,
          version: f.task.version,
          title: "Signed matrix edit",
        },
        expected_version: f.task.version,
        credential_hash: createHash("sha256").update(token).digest("hex"),
      });
      return {
        body: {
          operation_json,
          operation_hash: createHash("sha256")
            .update(operation_json)
            .digest("hex"),
        },
        signature: createHmac("sha256", approvalKey)
          .update(operation_json)
          .digest("hex"),
      };
    }
    function reviewEnvelope(f: Fixture, controller_id: string) {
      const payload = {
        version: 1,
        audience: "taff",
        issuer: "twin",
        source: "private_wechat",
        receipt_id: randomUUID(),
        controller_id,
        workspace_id: workspaceId,
        run_id: f.run!.id,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        review: {
          version: f.run!.version,
          decision: "approve",
          comment: "",
          checks: {
            matchesDescription: true,
            verifiable: true,
            withinPermissions: true,
          },
          items: f.artifactIds.map((artifactId) => ({
            artifactId,
            decision: "approve",
            comment: "",
          })),
        },
      };
      const body = {
        ...payload,
        operation_hash: createHash("sha256")
          .update(canonicalJson(payload))
          .digest("hex"),
      };
      return {
        body,
        signature: createHmac("sha256", approvalKey)
          .update(canonicalJson(body))
          .digest("hex"),
      };
    }
    function signedRequest(
      path: string,
      envelope: { body: unknown; signature: string },
      headers: Record<string, string> = {},
    ) {
      return app.request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-taff-approval-signature": envelope.signature,
          ...headers,
        },
        body: JSON.stringify(envelope.body),
      });
    }
    const agentApprovalRoutes = signedRoutes.filter((path) =>
      path.includes("approved-operations"),
    );
    const humanApprovalRoutes = signedRoutes.filter((path) =>
      path.includes("trusted-reviews"),
    );
    it.each(
      agentApprovalRoutes.flatMap((path) =>
        [
          "owner-cookie",
          "member-cookie",
          "agent",
          "other-workspace",
          "read-only",
          "revoked",
          "bad-signature",
        ].map((actor) => ({ path, actor })),
      ),
    )("signed original-agent $path × $actor", async ({ path, actor }) => {
      const f = await fixture();
      let token =
        actor === "other-workspace" ? foreignAgentToken : f.token.token;
      if (actor === "read-only")
        token = (
          await core.createAgentToken(owner(), {
            workspaceId,
            memberId: agentId,
            name: "Low scope approval",
            scopes: ["tasks:read"],
          })
        ).token;
      if (actor === "revoked") await core.revokeAgentToken(owner(), f.token.id);
      const envelope = agentEnvelope(f, token);
      if (actor === "bad-signature") envelope.signature = "0".repeat(64);
      const headers: Record<string, string> = actor.endsWith("cookie")
        ? { cookie: cookies[actor === "owner-cookie" ? "owner" : "member"] }
        : { Authorization: `Bearer ${token}` };
      const response = await signedRequest(path, envelope, headers);
      expect(response.status).toBe(
        actor === "agent"
          ? path.endsWith("/status")
            ? 404
            : 200
          : actor.endsWith("cookie") ||
              actor === "revoked" ||
              actor === "bad-signature"
            ? 401
            : 403,
      );
      if (
        actor.endsWith("cookie") ||
        actor === "revoked" ||
        actor === "bad-signature"
      )
        expect(await response.json()).toMatchObject({ error: "unauthorized" });
    });
    it.each(["explicit", "default"])(
      "serializes signed execution against %s capability revocation",
      async (permission) => {
        const f = await fixture();
        const prior = (
          await core.getAgentProfile(owner(), agentId)
        ).permissions.find((p) => p.capability === "tasks.write")?.decision;
        if (permission === "explicit")
          await core.setAgentPermission(owner(), agentId, {
            capability: "tasks.write",
            decision: "allow",
          });
        else
          await connection.db.transaction(async (tx) => {
            await tx.execute(
              sql`select set_config('taff.actor_id', ${ownerUserId}, true)`,
            );
            await tx
              .delete(agentPermissions)
              .where(
                and(
                  eq(agentPermissions.agentId, agentId),
                  eq(agentPermissions.capability, "tasks.write"),
                ),
              );
          });
        const envelope = agentEnvelope(f, f.token.token);
        const headers = { Authorization: `Bearer ${f.token.token}` };
        let release!: () => void;
        let ready!: (pid: number) => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const locked = new Promise<number>((resolve) => {
          ready = resolve;
        });
        const taskLock = connection.db.transaction(async (tx) => {
          await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.id, f.task.id))
            .for("update");
          const rows = await tx.execute(sql`select pg_backend_pid() as pid`);
          ready(Number(rows[0].pid));
          await held;
        });
        const blockedBy = async (pid: number) => {
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const rows =
              await connection.client`select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`;
            if (rows.length) return Number(rows[0].pid);
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error("Expected authorization transaction to block");
        };
        const taskPid = await locked;
        const execution = signedRequest(
          agentApprovalRoutes[0],
          envelope,
          headers,
        );
        let revocation: ReturnType<typeof core.setAgentPermission> | undefined;
        try {
          const executionPid = await blockedBy(taskPid);
          revocation = core.setAgentPermission(owner(), agentId, {
            capability: "tasks.write",
            decision: "deny",
          });
          await blockedBy(executionPid);
          release();
          await taskLock;
          expect((await execution).status).toBe(200);
          await revocation;
          for (const path of agentApprovalRoutes)
            expect((await signedRequest(path, envelope, headers)).status).toBe(
              403,
            );
        } finally {
          release();
          await taskLock;
          await execution;
          await revocation;
          await core.setAgentPermission(owner(), agentId, {
            capability: "tasks.write",
            decision: prior ?? "allow",
          });
        }
      },
    );

    it("signed execution and receipt replay both reject lost capability", async () => {
      const f = await fixture();
      const envelope = agentEnvelope(f, f.token.token);
      const headers = { Authorization: `Bearer ${f.token.token}` };
      expect(
        (await signedRequest(agentApprovalRoutes[0], envelope, headers)).status,
      ).toBe(200);
      const prior = (
        await core.getAgentProfile(owner(), agentId)
      ).permissions.find((p) => p.capability === "tasks.write")?.decision;
      try {
        await core.setAgentPermission(owner(), agentId, {
          capability: "tasks.write",
          decision: "deny",
        });
        for (const path of agentApprovalRoutes)
          expect((await signedRequest(path, envelope, headers)).status).toBe(
            403,
          );
      } finally {
        await core.setAgentPermission(owner(), agentId, {
          capability: "tasks.write",
          decision: prior ?? "allow",
        });
      }
    });
    it.each(
      humanApprovalRoutes.flatMap((path) =>
        [
          "owner",
          "member",
          "other-workspace",
          "unmapped",
          "bad-signature",
          "agent-only",
        ].map((actor) => ({ path, actor })),
      ),
    )("signed human review $path × $actor", async ({ path, actor }) => {
      const f = await fixture();
      await review(f);
      const controllerId = randomUUID();
      if (actor !== "unmapped")
        mappings.push({
          controllerId,
          workspaceId,
          userId:
            actor === "member"
              ? people.member.id
              : actor === "other-workspace"
                ? people["other-workspace"].id
                : ownerUserId,
          verifiedByUserId: ownerUserId,
        });
      const envelope = reviewEnvelope(f, controllerId);
      if (actor === "bad-signature" || actor === "agent-only")
        envelope.signature = "0".repeat(64);
      try {
        const response = await signedRequest(
          path,
          envelope,
          actor === "agent-only"
            ? { Authorization: `Bearer ${f.token.token}` }
            : {},
        );
        expect(response.status).toBe(
          actor === "owner"
            ? path.endsWith("/status")
              ? 404
              : 200
            : actor === "bad-signature" || actor === "agent-only"
              ? 401
              : 403,
        );
        if (actor === "bad-signature" || actor === "agent-only")
          expect(await response.json()).toMatchObject({
            error: "unauthorized",
          });
      } finally {
        mappings.length = 0;
      }
    });
    it.each(["mapping", "verifier"])(
      "human execution and receipt replay reject revoked %s",
      async (loss) => {
        const f = await fixture();
        await review(f);
        const controllerId = randomUUID();
        if (loss === "verifier")
          await core.updateMemberRole(owner(), workspaceId, memberId, {
            role: "admin",
          });
        mappings.push({
          controllerId,
          workspaceId,
          userId: ownerUserId,
          verifiedByUserId:
            loss === "verifier" ? people.member.id : ownerUserId,
        });
        const envelope = reviewEnvelope(f, controllerId);
        try {
          expect(
            (await signedRequest(humanApprovalRoutes[0], envelope)).status,
          ).toBe(200);
          if (loss === "mapping") mappings.length = 0;
          else
            await core.updateMemberRole(owner(), workspaceId, memberId, {
              role: "member",
            });
          for (const path of humanApprovalRoutes)
            expect((await signedRequest(path, envelope)).status).toBe(403);
        } finally {
          mappings.length = 0;
          if (loss === "verifier")
            await core.updateMemberRole(owner(), workspaceId, memberId, {
              role: "member",
            });
        }
      },
    );
    it("admin audit reads recheck the person's current workspace role", async () => {
      const f = await fixture();
      const reads = routes.filter(
        (row) =>
          row.path.startsWith("/api/admin/audit/") ||
          row.path.startsWith("/api/admin/integrations/"),
      );
      const headers = { cookie: cookies.member };
      try {
        await core.updateMemberRole(owner(), workspaceId, memberId, {
          role: "admin",
        });
        for (const row of reads)
          expect(
            (await app.request(pathFor(row.path, f), { headers })).status,
          ).toBe(200);
        await core.updateMemberRole(owner(), workspaceId, memberId, {
          role: "member",
        });
        for (const row of reads)
          expect(
            (await app.request(pathFor(row.path, f), { headers })).status,
          ).toBe(403);
      } finally {
        await core.updateMemberRole(owner(), workspaceId, memberId, {
          role: "member",
        });
      }
    });

    it.each(
      routes.flatMap((route) => actors.map((actor) => ({ ...route, actor }))),
    )("$method $path × $actor", async (row) => {
      const f = await fixture();
      await row.prepare?.(f);
      const response = await app.request(pathFor(row.path, f), {
        method: row.method,
        headers: {
          "Content-Type": "application/json",
          origin,
          ...(row.actor === "agent"
            ? { Authorization: `Bearer ${agentToken}` }
            : { cookie: cookies[row.actor] }),
        },
        ...(row.body ? { body: JSON.stringify(row.body(f)) } : {}),
      });
      const body = await response.json();
      if (row.actor === "other-workspace" && row.foreign === "own-workspace") {
        expect(response.status).toBe(200);
        expect(body.today?.workspaceId).not.toBe(workspaceId);
        expect(
          body.me.workspaces.every((w: { id: string }) => w.id !== workspaceId),
        ).toBe(true);
      } else if (row.actor === "agent") {
        expect(response.status, JSON.stringify(body)).toBe(401);
        expect(body).toMatchObject({ error: "unauthorized" });
      } else if (
        row.actor === "other-workspace" ||
        (row.actor === "member" && row.member === "deny")
      ) {
        expect([403, 404], JSON.stringify(body)).toContain(response.status);
        expect(["forbidden", "not_found"]).toContain(body.error);
      } else {
        expect(row.allowedStatus ?? [200, 201], JSON.stringify(body)).toContain(
          response.status,
        );
      }
    });

    const implicitWorkspaceTools = new Set([
      "context.get",
      "workspaces.list",
      "tasks.list",
      "projects.list",
      "projects.create",
      "search.query",
      "quickadd.parse",
      "calendar.list",
      "companies.list",
      "contacts.list",
      "relations.get",
      "brief.get",
    ]);
    async function toolArgs(
      name: string,
      f: Fixture,
    ): Promise<Record<string, unknown>> {
      if (
        [
          "runs.get",
          "runs.control",
          "runs.event",
          "runs.submit",
          "files.attach",
          "inbox.request_review",
        ].includes(name)
      )
        await running(f);
      if (name === "dependencies.add")
        await core.removeDependency(owner(), f.dependency.id);
      if (name === "runs.submit" || name === "inbox.request_review") {
        await core.attachRunArtifact(owner(), f.run!.id, {
          version: f.run!.version,
          name: "matrix.txt",
          mimeType: "text/plain",
          content: "Matrix",
          diff: null,
          sourceUrl: null,
        });
        f.run = (await core.getRun(owner(), f.run!.id)).run;
      }
      const args: Record<string, Record<string, unknown>> = {
        "context.get": {},
        "workspaces.list": {},
        "tasks.list": {},
        "tasks.create": {
          ownerId,
          title: "Matrix MCP task",
          projectId: f.project.id,
        },
        "tasks.update": { taskId: f.task.id, status: "in_progress" },
        "tasks.edit": {
          taskId: f.task.id,
          version: f.task.version,
          title: "Matrix MCP edit",
        },
        "tasks.comments.list": { taskId: f.task.id },
        "tasks.comments.add": { taskId: f.task.id, body: "Matrix MCP comment" },
        "projects.list": {},
        "projects.create": { name: "Matrix prepared project" },
        "projects.edit": {
          projectId: f.project.id,
          version: f.project.version,
          name: "Matrix prepared rename",
        },
        "search.query": { query: "Matrix" },
        "quickadd.parse": { text: "Matrix tomorrow" },
        "calendar.list": {
          from: "2026-10-16T00:00:00Z",
          to: "2026-10-23T00:00:00Z",
        },
        "calendar.set": {
          taskId: f.task.id,
          version: f.task.version,
          schedule: null,
        },
        "calendar.schedule": {
          taskId: f.task.id,
          dueAt: "2026-10-20T00:00:00Z",
        },
        "inbox.request_review": { taskId: f.task.id, note: "Matrix review" },
        "runs.get": { runId: f.run?.id },
        "runs.start": { taskId: f.task.id },
        "runs.control": {
          runId: f.run?.id,
          version: f.run?.version,
          action: "pause",
        },
        "runs.event": {
          runId: f.run?.id,
          version: f.run?.version,
          kind: "step",
          title: "Matrix step",
        },
        "runs.submit": {
          runId: f.run?.id,
          version: f.run?.version,
          summary: "Matrix submitted",
        },
        "files.attach": {
          runId: f.run?.id,
          version: f.run?.version,
          name: "matrix.txt",
          mimeType: "text/plain",
          content: "Matrix",
        },
        "grants.request": {
          agentId,
          taskId: f.task.id,
          capability: "repo.read",
          reason: "Matrix grant",
        },
        "timeline.get": { projectId: f.project.id },
        "tasks.plan": {
          taskId: f.task.id,
          startDate: "2026-10-20",
          durationDays: 2,
        },
        "dependencies.add": {
          predecessorTaskId: f.predecessor.id,
          successorTaskId: f.task.id,
        },
        "dependencies.remove": { dependencyId: f.dependency.id },
        "companies.list": {},
        "contacts.list": {},
        "contacts.get": { contactId: f.contact.id },
        "relations.get": {},
        "brief.get": {},
        "suggestions.create": {
          taskId: f.task.id,
          kind: "split",
          payload: { subtasks: [{ title: "Matrix child" }] },
        },
      };
      if (!args[name]) throw new Error(`Missing tool matrix row: ${name}`);
      return args[name];
    }

    async function rpcJson(response: Response) {
      const text = await response.text();
      const raw = response.headers.get("content-type")?.includes("event-stream")
        ? text
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
        : text;
      if (!raw) throw new Error("MCP response has no JSON result");
      return JSON.parse(raw);
    }
    async function rpc(actor: Actor, method: string, params: unknown) {
      return app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(actor === "agent" || actor === "other-workspace"
            ? {
                Authorization: `Bearer ${actor === "agent" ? agentToken : foreignAgentToken}`,
              }
            : { cookie: cookies[actor] }),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    }
    it("MCP matrix includes exactly every registered tool", async () => {
      const response = await rpc("agent", "tools/list", {});
      expect(response.status).toBe(200);
      const data = await rpcJson(response);
      expect(
        data.result.tools.map((tool: { name: string }) => tool.name).sort(),
      ).toEqual([...MCP_TOOLS]);
    });
    it.each(
      MCP_TOOLS.flatMap((name) => actors.map((actor) => ({ name, actor }))),
    )("MCP $name × $actor", async ({ name, actor }) => {
      const f = await fixture();
      const args = await toolArgs(name, f);
      const response = await rpc(actor, "tools/call", {
        name,
        arguments: args,
      });
      const data = await rpcJson(response);
      if (actor === "owner" || actor === "member") {
        expect(response.status).toBe(401);
        expect(data.error).toBe("unauthorized");
        return;
      }
      expect(response.status, JSON.stringify(data)).toBe(200);
      expect(data.error, JSON.stringify(data)).toBeUndefined();
      if (actor === "other-workspace" && !implicitWorkspaceTools.has(name)) {
        expect(data.result.isError, JSON.stringify(data)).toBe(true);
        // A foreign owner is invalid in the token's workspace; core rejects it
        // before task creation. Resource-targeted tools hide or deny the target.
        expect(
          name === "tasks.create"
            ? ["invalid_input"]
            : ["forbidden", "not_found"],
        ).toContain(data.result.content[0].text);
      } else {
        expect(data.result.isError, JSON.stringify(data)).not.toBe(true);
        if (actor === "other-workspace") {
          const text = JSON.stringify(data.result);
          for (const id of [
            workspaceId,
            ownerId,
            agentId,
            f.task.id,
            f.project.id,
            f.contact.id,
          ])
            expect(text).not.toContain(id);
        }
      }
    });

    it.each(
      organizationRoutes.flatMap(([method, path]) =>
        actors.map((actor) => ({ method, path, actor })),
      ),
    )(
      "organization lifecycle $method $path × $actor",
      async ({ method, path, actor }) => {
        const target =
          method === "DELETE"
            ? (
                await core.createWorkspace(owner(), {
                  name: `Matrix cleanup ${randomUUID()}`,
                })
              ).id
            : ownerUserId;
        const response = await app.request(path.replace(":id", target), {
          method,
          headers:
            actor === "agent"
              ? { Authorization: `Bearer ${agentToken}` }
              : {
                  cookie: cookies[actor],
                  Origin: origin,
                  "Content-Type": "application/json",
                },
          ...(method === "PATCH"
            ? { body: JSON.stringify({ workspaceId }) }
            : {}),
        });
        expect(response.status).toBe(
          actor === "agent"
            ? 401
            : method !== "GET" && actor === "owner"
              ? 200
              : 403,
        );
        if (method === "DELETE" && response.status === 200)
          expect(
            (await core.getMe(ownerUserId)).workspaces.some(
              (row) => row.id === target,
            ),
          ).toBe(false);
      },
    );

    const personal = [
      "/api/me",
      "/api/bootstrap",
      "/api/me/notifications",
      "/api/me/email-verification",
    ];
    it.each(
      personal.flatMap((path) => actors.map((actor) => ({ path, actor }))),
    )("self-scoped $path × $actor", async ({ path, actor }) => {
      const response = await app.request(path, {
        headers:
          actor === "agent"
            ? { Authorization: `Bearer ${agentToken}` }
            : { cookie: cookies[actor] },
      });
      const data = await rpcJson(response);
      expect(response.status).toBe(actor === "agent" ? 401 : 200);
      if (
        actor === "other-workspace" &&
        (path === "/api/me" || path === "/api/bootstrap")
      ) {
        expect(data.user.id).not.toBe(ownerUserId);
        expect(
          data.workspaces.every((w: { id: string }) => w.id !== workspaceId),
        ).toBe(true);
      }
    });
    const personalWrites = [
      {
        method: "PATCH",
        path: "/api/profile",
        body: { locale: "en", tz: "UTC" },
      },
      {
        method: "POST",
        path: "/api/workspaces",
        body: { name: "Matrix personal workspace" },
      },
      {
        method: "PATCH",
        path: "/api/me/notifications",
        body: {
          version: 1,
          review: true,
          block: true,
          mention: true,
          done: true,
          digest: true,
          digestAt: "09:00",
          quiet: false,
        },
      },
    ];
    it.each(
      personalWrites.flatMap((row) =>
        actors.map((actor) => ({ ...row, actor })),
      ),
    )(
      "self-scoped $method $path × $actor",
      async ({ path, method, body, actor }) => {
        const response = await app.request(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            origin,
            ...(actor === "agent"
              ? { Authorization: `Bearer ${agentToken}` }
              : { cookie: cookies[actor] }),
          },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(
          actor === "agent" ? 401 : method === "POST" ? 201 : 200,
        );
      },
    );

    // Public authentication follows the supplied credentials, never an existing
    // cookie or MCP bearer. Protected proof/invite routes remain person-scoped.
    const lifecycleActors = [...actors, "anonymous" as const];
    function lifecycleHeaders(actor: Actor | "anonymous") {
      return {
        "Content-Type": "application/json",
        origin,
        ...(actor === "agent"
          ? { Authorization: `Bearer ${agentToken}` }
          : actor === "anonymous"
            ? {}
            : { cookie: cookies[actor] }),
      };
    }
    it.each(
      lifecycleRoutes.flatMap(([method, path]) =>
        lifecycleActors.map((actor) => ({ method, path, actor })),
      ),
    )(
      "lifecycle $method $path × $actor",
      async ({ method, path, actor }) => {
        const headers: Record<string, string> = lifecycleHeaders(actor);
        const person =
          actor === "agent" || actor === "anonymous"
            ? undefined
            : people[actor];
        let body: unknown;
        let expected = 200;
        let target: Awaited<ReturnType<typeof signup>> | undefined;
        let invitedWorkspace: string | undefined;
        let number: string | undefined;
        if (path === "/api/auth/sign-in/phone-number") {
          target = await signup("Lifecycle phone credential target");
          number = `+86138${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
          await connection.db.transaction(async (tx) => {
            await tx.execute(
              sql`select set_config('taff.actor_id','system:test',true)`,
            );
            await tx
              .update(user)
              .set({ phoneNumber: number })
              .where(eq(user.id, target!.id));
          });
          body = { phoneNumber: number, password: target.password };
        } else if (path.includes("phone-number")) {
          number = `+86138${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
          if (path.endsWith("verify")) {
            const sent = await app.request("/api/auth/phone-number/send-otp", {
              method: "POST",
              headers: { "Content-Type": "application/json", origin },
              body: JSON.stringify({ phoneNumber: number }),
            });
            expect(sent.status).toBe(200);
            body = { phoneNumber: number, code: delivered.get(number) };
          } else body = { phoneNumber: number };
        } else if (path.includes("sign-in")) {
          target = await signup("Lifecycle credential target");
          body = path.endsWith("username")
            ? { username: target.username, password: target.password }
            : { email: target.email, password: target.password };
        } else if (path.endsWith("sign-up/email")) {
          body = {
            name: "Lifecycle signup",
            email: `${randomUUID()}@test.local`,
            password: randomUUID(),
          };
        } else if (path.endsWith("sign-out")) {
          // Revoke a fresh session, leaving other matrix rows independent.
          if (person) {
            const signedIn = await core.auth.api.signInEmail({
              body: { email: person.email, password: person.password },
              asResponse: true,
            });
            headers.cookie = sessionCookie(signedIn);
          }
          body = {};
        } else if (path.includes("email-verification")) {
          expected = person ? 200 : 401;
          body = path.endsWith("/verify")
            ? {
                token: await createEmailVerificationToken(
                  authSecret,
                  (person ?? people.owner).email,
                  undefined,
                  3600,
                  {
                    purpose: "taff.email-verification",
                    userId: (person ?? people.owner).id,
                  },
                ),
              }
            : {};
        } else if (path.endsWith("invites/accept")) {
          expected = person ? 200 : 401;
          const recipient = person ?? people.owner;
          // The same valid recipient proof is required for every workspace role.
          const proof = await createEmailVerificationToken(
            authSecret,
            recipient.email,
            undefined,
            3600,
            { purpose: "taff.email-verification", userId: recipient.id },
          );
          await core.verifyEmailOwnership(userPrincipal(recipient.id), {
            token: proof,
          });
          const issuer = userPrincipal((await signup("Lifecycle inviter")).id);
          const ws = await core.createWorkspace(issuer, {
            name: "Lifecycle invitation",
          });
          invitedWorkspace = ws.id;
          const invite = await core.createWorkspaceInvite(issuer, ws.id, {
            email: recipient.email,
            role: "member",
          });
          body = { token: invite.token };
        }
        const response = await app.request(path, {
          method,
          headers,
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        expect(response.status, JSON.stringify(data)).toBe(expected);
        if (expected === 401) {
          expect(data).toEqual({ error: "unauthorized" });
          return;
        }
        if (path === "/api/health") expect(data).toEqual({ status: "ok" });
        if (path === "/api/auth/methods")
          expect(data).toEqual({ smsEnabled: true });
        if (path.endsWith("send-otp"))
          expect(delivered.get(number!)).toMatch(/^\d{6}$/);
        if (
          path.includes("sign-in") ||
          path.endsWith("sign-up/email") ||
          path.endsWith("phone-number/verify")
        ) {
          const fresh = sessionCookie(response);
          expect(fresh).toContain("session_token=");
          const me = await (
            await app.request("/api/me", { headers: { cookie: fresh } })
          ).json();
          if (target) expect(me.user.id).toBe(target.id);
          if (person) expect(me.user.id).not.toBe(person.id);
          if (path.endsWith("sign-up/email"))
            expect(me.user.email).toBe((body as { email: string }).email);
          if (number) expect(data).toEqual({ status: true });
        }
        if (path.endsWith("sign-out") && person) {
          expect(
            (
              await app.request("/api/me", {
                headers: { cookie: headers.cookie },
              })
            ).status,
          ).toBe(401);
          expect(
            (
              await app.request("/api/me", {
                headers: { cookie: person.cookie },
              })
            ).status,
          ).toBe(200);
        }
        if (path.endsWith("email-verification/request")) {
          expect(
            messages.some(
              (m) => m.to === person!.email && m.text.includes("#verifyEmail="),
            ),
          ).toBe(true);
          expect(data).toEqual({ emailVerified: false, delivery: "logged" });
        }
        if (path.endsWith("email-verification/verify"))
          expect(data).toEqual({ emailVerified: true });
        if (invitedWorkspace && person) {
          const me = await core.getMe(person.id);
          expect(me.workspaces.some((w) => w.id === invitedWorkspace)).toBe(
            true,
          );
        }
      },
      15000,
    );
    it.each(actors.filter((actor) => actor !== "agent"))(
      "lifecycle proofs cannot cross account boundaries × %s",
      async (actor) => {
        const person = people[actor];
        const stranger = await signup("Lifecycle stranger");
        const proof = await createEmailVerificationToken(
          authSecret,
          stranger.email,
          undefined,
          3600,
          { purpose: "taff.email-verification", userId: stranger.id },
        );
        const response = await app.request(
          "/api/me/email-verification/verify",
          {
            method: "POST",
            headers: lifecycleHeaders(actor),
            body: JSON.stringify({ token: proof }),
          },
        );
        expect(response.status).toBe(400);
        expect(
          await core.getEmailVerificationStatus(userPrincipal(stranger.id)),
        ).toEqual({ emailVerified: false });
        const issuer = userPrincipal(
          (await signup("Separate lifecycle inviter")).id,
        );
        const ws = await core.createWorkspace(issuer, {
          name: "Foreign recipient invite",
        });
        const invite = await core.createWorkspaceInvite(issuer, ws.id, {
          email: stranger.email,
          role: "member",
        });
        const denied = await app.request("/api/workspace-invites/accept", {
          method: "POST",
          headers: lifecycleHeaders(actor),
          body: JSON.stringify({ token: invite.token }),
        });
        expect([403, 404]).toContain(denied.status);
        expect(
          (await core.getMe(person.id)).workspaces.some((w) => w.id === ws.id),
        ).toBe(false);
      },
    );

    // OAuth for MCP (ADR 0022): public endpoints ignore cookies and bearer
    // tokens; consent needs a person, and only an admin may approve.
    it.each(lifecycleActors)(
      "public OAuth endpoints ignore credentials × %s",
      async (actor) => {
        const headers = lifecycleHeaders(actor);
        for (const path of oauthMetadataRoutes) {
          const response = await app.request(path, { headers });
          expect(response.status).toBe(200);
          expect(response.headers.get("access-control-allow-origin")).toBe("*");
        }
        const registered = await app.request("/api/oauth/register", {
          method: "POST",
          headers,
          body: JSON.stringify({
            client_name: `Matrix ${actor}`,
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          }),
        });
        expect(registered.status).toBe(201);
        const { client_id } = await registered.json();
        const form = (fields: Record<string, string>) => ({
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(fields).toString(),
        });
        const bogus = await app.request(
          "/api/oauth/token",
          form({
            grant_type: "authorization_code",
            client_id,
            code: "taffcode_not-a-code",
            code_verifier: "v".repeat(43),
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          }),
        );
        expect(bogus.status).toBe(400);
        expect((await bogus.json()).error).toBe("invalid_grant");
        const stranger = await app.request(
          "/api/oauth/token",
          form({
            grant_type: "refresh_token",
            client_id: "mcp_unknown",
            refresh_token: "taffr_unknown",
          }),
        );
        expect(stranger.status).toBe(401);
        expect((await stranger.json()).error).toBe("invalid_client");
        const revoked = await app.request(
          "/api/oauth/revoke",
          form({ token: agentToken, client_id }),
        );
        expect(revoked.status).toBe(200);
        // Revoking someone else's personal token through OAuth does nothing.
        expect(await core.authenticateAgentToken(agentToken)).not.toBeNull();
      },
    );
    it.each(lifecycleActors)(
      "OAuth consent needs a person and approval needs an admin × %s",
      async (actor) => {
        const client = await core.oauth.registerClient({
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        });
        const request = {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          code_challenge: "c".repeat(43),
          code_challenge_method: "S256",
          state: "matrix",
        };
        const headers = lifecycleHeaders(actor);
        const read = await app.request(
          `/api/oauth/consent?${new URLSearchParams(request)}`,
          { headers },
        );
        const decided = await app.request("/api/oauth/consent", {
          method: "POST",
          headers,
          body: JSON.stringify({
            request,
            decision: "approve",
            workspaceId,
            memberId: agentId,
            scopes: ["tasks:read"],
          }),
        });
        if (actor === "agent" || actor === "anonymous") {
          expect(read.status).toBe(401);
          expect(decided.status).toBe(401);
          return;
        }
        expect(read.status).toBe(200);
        const listed = (await read.json()).workspaces.some(
          (item: { id: string }) => item.id === workspaceId,
        );
        expect(listed).toBe(actor === "owner");
        expect(decided.status).toBe(actor === "owner" ? 200 : 403);
        if (actor === "owner")
          expect(
            new URL((await decided.json()).redirectTo).searchParams.get("code"),
          ).toMatch(/^taffcode_/);
      },
    );

    it.each([...lifecycleActors, "guest" as const])(
      "role-based OAuth grant list, revoke and restore × %s",
      async (actor) => {
        await core.updateAgentProfile(owner(), agentId, {
          supervisorId: memberId,
          maxDurationMs: null,
          maxCostMicros: null,
          reviewPolicy: "always_review",
        });
        try {
          const client = await core.oauth.registerClient({
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          });
          const request = {
            response_type: "code",
            client_id: client.client_id,
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
            code_challenge: "c".repeat(43),
            code_challenge_method: "S256",
          };
          const approval = await app.request("/api/oauth/consent", {
            method: "POST",
            headers: lifecycleHeaders("member"),
            body: JSON.stringify({
              request,
              decision: "approve",
              workspaceId,
              memberId: agentId,
              scopes: ["tasks:read"],
            }),
          });
          expect(approval.status).toBe(200);
          // Issue a real OAuth grant with PKCE, rather than forging a token row.
          const verifier = "v".repeat(43);
          const challenge = createHash("sha256")
            .update(verifier)
            .digest("base64url");
          const approved = await core.oauth.decide(
            userPrincipal(people.member.id),
            {
              request: {
                ...request,
                response_type: "code",
                code_challenge: challenge,
                code_challenge_method: "S256",
              },
              decision: "approve",
              workspaceId,
              memberId: agentId,
              scopes: ["tasks:read"],
            },
          );
          const issued = await core.oauth.token({
            grant_type: "authorization_code",
            client_id: client.client_id,
            code: new URL(approved.redirectTo).searchParams.get("code")!,
            redirect_uri: request.redirect_uri,
            code_verifier: verifier,
          });
          const principal = await core.authenticateAgentToken(
            issued.access_token,
          );
          const id = (principal as { tokenId: string }).tokenId;
          if (actor === "guest")
            await core.updateMemberRole(owner(), workspaceId, memberId, {
              role: "guest",
            });
          const headers = lifecycleHeaders(
            actor === "guest" ? "member" : actor,
          );
          const consent = await app.request(
            `/api/oauth/consent?${new URLSearchParams(request)}`,
            { headers },
          );
          if (actor === "guest") {
            expect(consent.status).toBe(200);
            expect(
              (await consent.json()).workspaces.some(
                (item: { id: string }) => item.id === workspaceId,
              ),
            ).toBe(false);
          }
          const deniedScope = await app.request("/api/oauth/consent", {
            method: "POST",
            headers,
            body: JSON.stringify({
              request,
              decision: "approve",
              workspaceId,
              memberId: agentId,
              scopes: ["files:write"],
            }),
          });
          expect(deniedScope.status).toBe(
            actor === "owner"
              ? 200
              : actor === "agent" || actor === "anonymous"
                ? 401
                : 403,
          );
          const allowed = actor === "owner" || actor === "member";
          const status = allowed
            ? 200
            : actor === "agent" || actor === "anonymous"
              ? 401
              : 403;
          const list = await app.request(
            `/api/agent-tokens?workspaceId=${workspaceId}`,
            { headers },
          );
          expect(list.status).toBe(status);
          if (allowed)
            expect(
              (await list.json()).some((row: { id: string }) => row.id === id),
            ).toBe(true);
          const revoked = await app.request(`/api/agent-tokens/${id}`, {
            method: "DELETE",
            headers,
          });
          expect(revoked.status).toBe(status);
          if (!allowed) await core.revokeAgentToken(owner(), id);
          const restored = await app.request(
            `/api/agent-tokens/${id}/restore`,
            { method: "POST", headers },
          );
          expect(restored.status).toBe(status);
        } finally {
          if (actor === "guest")
            await core.updateMemberRole(owner(), workspaceId, memberId, {
              role: "member",
            });
          await core.updateAgentProfile(owner(), agentId, {
            supervisorId: null,
            maxDurationMs: null,
            maxCostMicros: null,
            reviewPolicy: "always_review",
          });
        }
      },
    );

    it("every REST endpoint is covered by the actor matrix", () => {
      const normalize = (path: string) =>
        path.split("?")[0].replace(/:[^/]+/g, ":id");
      const covered = new Set([
        ...routes.map((row) => `${row.method} ${normalize(row.path)}`),
        ...organizationRoutes.map(
          ([method, path]) => `${method} ${normalize(path)}`,
        ),
        ...personal.map((path) => `GET ${path}`),
        ...personalWrites.map((row) => `${row.method} ${row.path}`),
        ...lifecycleRoutes.map(([method, path]) => `${method} ${path}`),
        ...oauthMetadataRoutes.map((path) => `GET ${path}`),
        ...signedRoutes.map((path) => `POST ${path}`),
        "POST /api/oauth/register",
        "POST /api/oauth/token",
        "POST /api/oauth/revoke",
        "GET /api/oauth/consent",
        "POST /api/oauth/consent",
      ]);
      const uncovered = [
        ...new Set(
          app.routes
            .filter((route) => route.method !== "ALL")
            .map((route) => `${route.method} ${normalize(route.path)}`),
        ),
      ].filter((key) => !covered.has(key));
      expect(uncovered).toEqual([]);
    });
  },
);
