// Exercises every MCP tool, the rate limit and token revocation against the
// local API with the official v2 client. Run with the dev services up.
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createCore, userPrincipal } from "@taff/core";
import { connectDatabase, user } from "@taff/db";
import { eq } from "drizzle-orm";

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
const connection = connectDatabase(env("DATABASE_URL"));
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
  const [person] = await connection.db
    .select()
    .from(user)
    .where(eq(user.email, process.env.DEMO_EMAIL ?? "alex@taff.local"))
    .limit(1);
  if (!person) throw new Error("Run pnpm db:seed first");
  const me = await core.getMe(person.id);
  const workspace = me.workspaces[0];
  const asUser = userPrincipal(person.id);
  const members = await core.listMembers(asUser, workspace.id);
  const agent = members.find((member) => member.kind === "agent");
  if (!agent) throw new Error("The demo workspace has no agent");
  const issued = await core.createAgentToken(asUser, {
    workspaceId: workspace.id,
    memberId: agent.id,
    name: `smoke ${new Date().toISOString()}`,
    scopes: ["tasks:read", "tasks:write", "calendar:write", "inbox:review"],
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
    "lists the five tools",
    JSON.stringify(tools) ===
      JSON.stringify([
        "calendar.schedule",
        "inbox.request_review",
        "tasks.create",
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
      },
    }),
  );
  check(
    "tasks.create returns a task worked by the agent",
    created?.workerId === agent.id,
    created,
  );
  const taskId = String(created?.id);
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
  const listed = text(
    await client.callTool({
      name: "tasks.list",
      arguments: { status: "needs_review" },
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
  await connection.close();
}
if (failures) {
  console.error(`${failures} MCP smoke check(s) failed`);
  process.exit(1);
}
console.log("MCP smoke passed");
