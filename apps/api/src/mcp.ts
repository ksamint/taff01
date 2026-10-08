import {
  type CallToolResult,
  createMcpHandler,
  McpServer,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import {
  type $ZodType,
  type input,
  type output,
  toJSONSchema,
} from "zod/v4/core";

/** zod/mini schemas validate but carry no JSON Schema; the SDK needs both. */
function toolSchema<T extends $ZodType>(
  schema: T,
): StandardSchemaWithJSON<input<T>, output<T>> {
  const standard = schema["~standard"] as StandardSchemaWithJSON<
    input<T>,
    output<T>
  >["~standard"];
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        input: (options) =>
          toJSONSchema(schema, { target: options.target, io: "input" }),
        output: (options) =>
          toJSONSchema(schema, { target: options.target, io: "output" }),
      },
    },
  };
}

import type { Core, Principal } from "@taff/core";
import { CoreError } from "@taff/core";
import {
  type McpCall,
  mcpCalendarScheduleArgs,
  mcpInboxRequestReviewArgs,
  mcpTasksCreateArgs,
  mcpTasksListArgs,
  mcpTasksUpdateArgs,
} from "@taff/schemas";

type AgentPrincipal = Extract<Principal, { kind: "agent" }>;
type CallState = { failed?: McpCall["status"] };

function ok(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: { result: payload } as Record<string, unknown>,
  };
}
function failure(error: unknown, state: CallState): CallToolResult {
  const code = error instanceof CoreError ? error.code : "internal_error";
  state.failed = code === "forbidden" ? "denied" : "error";
  return { isError: true, content: [{ type: "text", text: code }] };
}

/** One MCP server per request, bound to the token's agent and workspace. */
export function createMcpServer(
  core: Core,
  principal: AgentPrincipal,
  state: CallState,
) {
  const server = new McpServer({ name: "taff", version: "0.1.0" });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return ok(await fn());
    } catch (error) {
      return failure(error, state);
    }
  };
  server.registerTool(
    "tasks.list",
    {
      title: "List tasks",
      description: "Read and filter the workspace's tasks.",
      inputSchema: toolSchema(mcpTasksListArgs),
    },
    (args) =>
      run(() =>
        core.listTasks(principal, principal.workspaceId, {
          status: args.status,
        }),
      ),
  );
  server.registerTool(
    "tasks.create",
    {
      title: "Create task",
      description:
        "Create a task owned by a person; the calling agent becomes its worker.",
      inputSchema: toolSchema(mcpTasksCreateArgs),
    },
    (args) =>
      run(() =>
        core.createTask(principal, {
          workspaceId: principal.workspaceId,
          title: args.title,
          ownerId: args.ownerId,
          workerId: principal.memberId,
          dueAt: args.dueAt ?? null,
        }),
      ),
  );
  server.registerTool(
    "tasks.update",
    {
      title: "Update task",
      description:
        "Update the status (in_progress or needs_review) or worker of a task the agent works on.",
      inputSchema: toolSchema(mcpTasksUpdateArgs),
    },
    (args) =>
      run(async () => {
        let task =
          args.workerId !== undefined
            ? await core.assignTask(principal, args.taskId, {
                workerId: args.workerId,
              })
            : null;
        if (args.status)
          task = await core.updateTaskStatus(principal, args.taskId, {
            status: args.status,
          });
        if (!task) throw new CoreError("invalid_input", 400);
        return task;
      }),
  );
  server.registerTool(
    "calendar.schedule",
    {
      title: "Schedule task",
      description: "Set or clear the due time of a task the agent works on.",
      inputSchema: toolSchema(mcpCalendarScheduleArgs),
    },
    (args) =>
      run(() =>
        core.scheduleTask(principal, args.taskId, { dueAt: args.dueAt }),
      ),
  );
  server.registerTool(
    "inbox.request_review",
    {
      title: "Request review",
      description:
        "Hand the task to its owner for review; it waits in needs_review until a person approves.",
      inputSchema: toolSchema(mcpInboxRequestReviewArgs),
    },
    (args) =>
      run(() =>
        core.updateTaskStatus(principal, args.taskId, {
          status: "needs_review",
        }),
      ),
  );
  return server;
}

export function createMcpHttpHandler(core: Core) {
  return createMcpHandler(
    (ctx) => {
      const extra = ctx.authInfo?.extra as
        | { principal: AgentPrincipal; state: CallState }
        | undefined;
      if (!extra) throw new CoreError("unauthorized", 401);
      return createMcpServer(core, extra.principal, extra.state);
    },
    { responseMode: "json", maxRequestBodySize: 65_536 },
  );
}

/** Method and tool name from a JSON-RPC body, for the call log only. */
export function describeCall(body: unknown): {
  method: string;
  tool: string | null;
} {
  const first = Array.isArray(body) ? body[0] : body;
  if (!first || typeof first !== "object")
    return { method: "invalid", tool: null };
  const message = first as { method?: unknown; params?: { name?: unknown } };
  return {
    method: typeof message.method === "string" ? message.method : "invalid",
    tool: typeof message.params?.name === "string" ? message.params.name : null,
  };
}
