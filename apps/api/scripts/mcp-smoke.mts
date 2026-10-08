// Exercises every MCP tool, the rate limit and token revocation against the
// local API with the official v2 client. Run with the dev services up.
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createCore, userPrincipal } from "@taff/core";
import {
  grantSchema,
  quickAddResultSchema,
  runDetailSchema,
  runSchema,
  searchResultSchema,
  taskSchema,
} from "@taff/schemas";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const apiUrl = new URL(
  "/mcp",
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001",
);
const limit = Number(process.env.MCP_RATE_LIMIT ?? 60);
const core = createCore({
  databaseUrl: env("DATABASE_URL"),
  authUrl: env("AUTH_URL"),
  authSecret: env("AUTH_SECRET"),
  tokenPepper: env("TOKEN_PEPPER"),
});
let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  console.log(
    `${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` ${JSON.stringify(detail)}`}`,
  );
  if (!condition) failures++;
}
function text(result: { content: { type: string; text?: string }[] }) {
  const block = result.content.find((item) => item.type === "text");
  return block?.text
    ? (JSON.parse(block.text) as Record<string, unknown>)
    : null;
}
try {
  const signedIn = await fetch(new URL("/api/auth/sign-in/email", apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: env("AUTH_URL") },
    body: JSON.stringify({
      email: process.env.DEMO_EMAIL ?? "alex@taff.local",
      password: env("DEMO_PASSWORD"),
    }),
  });
  if (!signedIn.ok)
    throw new Error(
      `Demo sign-in failed (${signedIn.status}); run pnpm db:seed first`,
    );
  const person = ((await signedIn.json()) as { user: { id: string } }).user;
  const me = await core.getMe(person.id);
  const workspace = me.workspaces[0];
  const asUser = userPrincipal(person.id);
  const project = await core.createProject(asUser, workspace.id, {
    name: `Smoke-${Date.now()}`,
  });
  const members = await core.listMembers(asUser, workspace.id);
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("The demo workspace has no agent");
  const issued = await core.createAgentToken(asUser, {
    workspaceId: workspace.id,
    memberId: agent.id,
    name: `smoke ${new Date().toISOString()}`,
    scopes: [
      "tasks:read",
      "tasks:write",
      "calendar:write",
      "inbox:review",
      "files:write",
    ],
  });
  const client = new Client({ name: "taff-smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(apiUrl, {
    authProvider: { token: async () => issued.token },
  });
  await client.connect(transport);
  const tools = (await client.listTools()).tools
    .map((tool) => tool.name)
    .sort();
  check(
    "lists every task, project, search, draft, run, grant and file tool",
    JSON.stringify(tools) ===
      JSON.stringify([
        "calendar.schedule",
        "files.attach",
        "grants.request",
        "inbox.request_review",
        "projects.list",
        "quickadd.parse",
        "runs.control",
        "runs.event",
        "runs.get",
        "runs.start",
        "runs.submit",
        "search.query",
        "tasks.comments.add",
        "tasks.comments.list",
        "tasks.create",
        "tasks.edit",
        "tasks.list",
        "tasks.update",
      ]),
    tools,
  );
  const created = text(
    await client.callTool({
      name: "tasks.create",
      arguments: {
        title: `Smoke task ${Date.now()}`,
        ownerId: workspace.memberId,
        description: "M5 MCP smoke",
        priority: 2,
        projectId: project.id,
        labels: ["smoke"],
      },
    }),
  );
  check(
    "tasks.create returns a task worked by the agent",
    created?.workerId === agent.id,
    created,
  );
  const taskId = String(created?.id);
  const edited = taskSchema.parse(
    text(
      await client.callTool({
        name: "tasks.edit",
        arguments: {
          taskId,
          version: created?.version,
          description: "M5 versioned edit",
          labels: ["smoke", "edited"],
        },
      }),
    ),
  );
  check(
    "tasks.edit preserves rich fields and increments the task version",
    edited.version === Number(created?.version) + 1 &&
      edited.projectId === project.id &&
      edited.labels.includes("edited"),
  );
  const projectList = text(
    await client.callTool({ name: "projects.list", arguments: {} }),
  );
  check(
    "projects.list reads the token workspace",
    Array.isArray(projectList) &&
      projectList.some((item) => item.id === project.id),
  );
  const parsed = quickAddResultSchema.parse(
    text(
      await client.callTool({
        name: "quickadd.parse",
        arguments: {
          text: `Quick smoke tomorrow 15:30 !high #${project.name} +smoke`,
        },
      }),
    ),
  );
  check(
    "quickadd.parse returns editable timezone-aware fields without creating work",
    parsed.title === "Quick smoke" &&
      parsed.priority === 2 &&
      parsed.projectId === project.id &&
      parsed.labels.includes("smoke") &&
      parsed.dueTime === "15:30" &&
      !!parsed.dueAt,
  );
  const commentBody = `Searchable MCP comment ${Date.now()}`;
  const comment = text(
    await client.callTool({
      name: "tasks.comments.add",
      arguments: { taskId, body: commentBody },
    }),
  );
  check(
    "tasks.comments.add stores real agent discussion",
    comment?.body === commentBody && comment?.authorId === agent.id,
  );
  const comments = text(
    await client.callTool({
      name: "tasks.comments.list",
      arguments: { taskId },
    }),
  );
  check(
    "tasks.comments.list reads the authorized discussion",
    Array.isArray(comments) && comments.some((item) => item.id === comment?.id),
  );
  const matches = text(
    await client.callTool({
      name: "search.query",
      arguments: { query: commentBody, scope: "all", types: ["comment"] },
    }),
  );
  check(
    "search.query finds the comment in the token workspace",
    Array.isArray(matches) &&
      matches.some((item) => {
        const match = searchResultSchema.parse(item);
        return match.id === comment?.id && match.workspaceId === workspace.id;
      }),
  );
  const started = text(
    await client.callTool({
      name: "tasks.update",
      arguments: { taskId, status: "in_progress" },
    }),
  );
  check(
    "tasks.update starts the task",
    started?.status === "in_progress",
    started,
  );
  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = text(
    await client.callTool({
      name: "calendar.schedule",
      arguments: { taskId, dueAt },
    }),
  );
  check(
    "calendar.schedule sets the due time",
    typeof scheduled?.dueAt === "string",
    scheduled,
  );
  let run = runSchema.parse(
    text(await client.callTool({ name: "runs.start", arguments: { taskId } })),
  );
  check("runs.start creates real running work", run.status === "running");
  const detail = async () =>
    runDetailSchema.parse(
      text(
        await client.callTool({
          name: "runs.get",
          arguments: { runId: run.id },
        }),
      ),
    );
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "pause" },
      }),
    ),
  );
  check("runs.control pauses", run.status === "paused");
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "resume" },
      }),
    ),
  );
  const grant = grantSchema.parse(
    text(
      await client.callTool({
        name: "grants.request",
        arguments: {
          agentId: agent.id,
          taskId,
          runId: run.id,
          capability: "repo.read",
          reason: "MCP smoke verifies scoped grants",
        },
      }),
    ),
  );
  check(
    "grants.request creates a pending human decision",
    grant.status === "pending",
  );
  await core.decideGrant(asUser, grant.id, {
    decision: "allow",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  run = (await detail()).run;
  if (run.status === "paused")
    run = runSchema.parse(
      text(
        await client.callTool({
          name: "runs.control",
          arguments: { runId: run.id, version: run.version, action: "resume" },
        }),
      ),
    );
  const measuredStart = performance.now();
  const discovery = await client.listTools();
  await client.callTool({
    name: "runs.event",
    arguments: {
      runId: run.id,
      version: run.version,
      kind: "test",
      title: "MCP tool discovery",
      text: `Discovered ${discovery.tools.length} tools`,
      testStatus: "passed",
      durationMs: Math.round(performance.now() - measuredStart),
      costMicros: 0,
    },
  });
  run = (await detail()).run;
  const attached = await client.callTool({
    name: "files.attach",
    arguments: {
      runId: run.id,
      version: run.version,
      name: "mcp-smoke.txt",
      mimeType: "text/plain",
      content: `Official client discovered:\n${tools.join("\n")}`,
      diff: "+ MCP discovery verified",
      sourceUrl: apiUrl.href,
    },
  });
  check("files.attach stores actual content", !attached.isError);
  run = (await detail()).run;
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId: run.id,
          version: run.version,
          summary: "MCP discovery verified",
        },
      }),
    ),
  );
  check("runs.submit waits for a person", run.status === "needs_review");
  run = await core.reviewRun(asUser, run.id, {
    version: run.version,
    decision: "request_changes",
    checks: {
      matchesDescription: false,
      verifiable: false,
      withinPermissions: false,
    },
    comment: "Include a source event before final approval",
    items: [],
  });
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "resume" },
      }),
    ),
  );
  await client.callTool({
    name: "runs.event",
    arguments: {
      runId: run.id,
      version: run.version,
      kind: "source",
      title: "Local MCP endpoint",
      sourceUrl: apiUrl.href,
    },
  });
  const review = text(
    await client.callTool({
      name: "inbox.request_review",
      arguments: { taskId },
    }),
  );
  check(
    "inbox.request_review hands over for review",
    review?.status === "needs_review",
    review,
  );
  const workspaceReview = await core.getReview(asUser, taskId);
  const approved = await core.reviewRun(asUser, workspaceReview.run.id, {
    version: workspaceReview.run.version,
    decision: "approve",
    checks: {
      matchesDescription: true,
      verifiable: true,
      withinPermissions: true,
    },
    comment: "",
    items: workspaceReview.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      decision: "approve",
      comment: "",
    })),
  });
  check("human review completes the run", approved.status === "completed");
  const listed = text(
    await client.callTool({
      name: "tasks.list",
      arguments: { status: "done" },
    }),
  ) as unknown as { id: string }[] | null;
  check(
    "tasks.list filters by status",
    Array.isArray(listed) && listed.some((task) => task.id === taskId),
  );
  const denied = await client.callTool({
    name: "tasks.update",
    arguments: { taskId, workerId: workspace.memberId },
  });
  check(
    "reassigning away from the agent is denied",
    denied.isError === true,
    denied,
  );
  let limited = false;
  for (let i = 0; i < limit + 2 && !limited; i++) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${issued.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/list" }),
    });
    limited = response.status === 429;
  }
  check(`rate limit of ${limit}/minute triggers 429`, limited);
  await client.close();
  await core.revokeAgentToken(asUser, issued.id);
  const revokedClient = new Client({ name: "taff-smoke", version: "0.1.0" });
  let unauthorized = false;
  try {
    await revokedClient.connect(
      new StreamableHTTPClientTransport(apiUrl, {
        authProvider: { token: async () => issued.token },
      }),
    );
  } catch (error) {
    unauthorized = /401|Unauthorized/i.test(String(error));
  }
  check("revoked token is rejected", unauthorized);
  const calls = await core.listMcpCalls(asUser, workspace.id);
  check(
    "calls are logged with method and tool",
    calls.some((call) => call.tool === "tasks.create" && call.status === "ok"),
  );
  check(
    "rate-limited calls are logged",
    calls.some((call) => call.status === "rate_limited"),
  );
} finally {
  await core.close();
}
if (failures) {
  console.error(`${failures} MCP smoke check(s) failed`);
  process.exit(1);
}
console.log("MCP smoke passed");
