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
  mcpCalendarListArgs,
  mcpCalendarScheduleArgs,
  mcpCalendarSetArgs,
  mcpFilesAttachArgs,
  mcpGrantsRequestArgs,
  mcpInboxRequestReviewArgs,
  mcpProjectsListArgs,
  mcpQuickAddArgs,
  mcpRunsControlArgs,
  mcpRunsEventArgs,
  mcpRunsGetArgs,
  mcpRunsStartArgs,
  mcpRunsSubmitArgs,
  mcpSearchArgs,
  mcpTaskCommentsAddArgs,
  mcpTaskCommentsListArgs,
  mcpTasksCreateArgs,
  mcpTasksEditArgs,
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
    (args) => run(() => core.listTasks(principal, principal.workspaceId, args)),
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
          ...args,
          workerId: principal.memberId,
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
    "tasks.edit",
    {
      title: "Edit task fields",
      description:
        "Edit the calling agent's task using its current version. Human review rules still apply.",
      inputSchema: toolSchema(mcpTasksEditArgs),
    },
    ({ taskId, ...input }) =>
      run(() => core.updateTask(principal, taskId, input)),
  );
  server.registerTool(
    "tasks.comments.list",
    {
      title: "Read task comments",
      description: "Read comments on an authorized workspace task.",
      inputSchema: toolSchema(mcpTaskCommentsListArgs),
    },
    ({ taskId }) => run(() => core.listTaskComments(principal, taskId)),
  );
  server.registerTool(
    "tasks.comments.add",
    {
      title: "Comment on task",
      description:
        "Add an actual comment to the calling agent's assigned task.",
      inputSchema: toolSchema(mcpTaskCommentsAddArgs),
    },
    ({ taskId, ...input }) =>
      run(() => core.addTaskComment(principal, taskId, input)),
  );
  server.registerTool(
    "projects.list",
    {
      title: "Read projects",
      description:
        "List the token workspace's projects. Project administration is a human action.",
      inputSchema: toolSchema(mcpProjectsListArgs),
    },
    () => run(() => core.listProjects(principal, principal.workspaceId)),
  );
  server.registerTool(
    "search.query",
    {
      title: "Search tasks and comments",
      description:
        "Search authorized tasks and comments; an agent remains limited to its token workspace.",
      inputSchema: toolSchema(mcpSearchArgs),
    },
    (input) => run(() => core.search(principal, principal.workspaceId, input)),
  );
  server.registerTool(
    "quickadd.parse",
    {
      title: "Parse a task draft",
      description:
        "Parse editable task fields in the saved time zone without creating a task.",
      inputSchema: toolSchema(mcpQuickAddArgs),
    },
    (input) =>
      run(() => core.parseQuickAdd(principal, principal.workspaceId, input)),
  );
  server.registerTool(
    "calendar.list",
    {
      title: "Read calendar",
      description:
        "Read bounded calendar occurrences and unscheduled tasks in the token workspace.",
      inputSchema: toolSchema(mcpCalendarListArgs),
    },
    (input) =>
      run(() => core.listCalendar(principal, principal.workspaceId, input)),
  );
  server.registerTool(
    "calendar.set",
    {
      title: "Edit calendar schedule",
      description:
        "Set or clear a calendar interval and whole-series recurrence using the task's current version. Its deadline stays unchanged.",
      inputSchema: toolSchema(mcpCalendarSetArgs),
    },
    ({ taskId, ...input }) =>
      run(() => core.setTaskCalendar(principal, taskId, input)),
  );
  server.registerTool(
    "calendar.schedule",
    {
      title: "Schedule task",
      description:
        "Set or clear a task deadline (legacy protocol). Use calendar.set for calendar intervals and recurrence.",
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
        core.requestReview(principal, args.taskId, { note: args.note }),
      ),
  );
  server.registerTool(
    "runs.get",
    {
      title: "Read agent run",
      description:
        "Read real steps, tool calls, sources, tests and artifacts for a run.",
      inputSchema: toolSchema(mcpRunsGetArgs),
    },
    ({ runId }) => run(() => core.getRun(principal, runId)),
  );
  server.registerTool(
    "runs.start",
    {
      title: "Start agent run",
      description:
        "Start a run for a task assigned to this agent. Progress is submitted explicitly.",
      inputSchema: toolSchema(mcpRunsStartArgs),
    },
    ({ taskId }) => run(() => core.startRun(principal, taskId, {})),
  );
  server.registerTool(
    "runs.control",
    {
      title: "Control agent run",
      description:
        "Pause, resume or cancel this agent's run using its current version.",
      inputSchema: toolSchema(mcpRunsControlArgs),
    },
    ({ runId, ...input }) =>
      run(() => core.controlRun(principal, runId, input)),
  );
  server.registerTool(
    "runs.event",
    {
      title: "Record agent progress",
      description:
        "Record a real step, tool call, source or test with measured duration and cost.",
      inputSchema: toolSchema(mcpRunsEventArgs),
    },
    ({ runId, ...input }) =>
      run(() => core.appendRunEvent(principal, runId, input)),
  );
  server.registerTool(
    "files.attach",
    {
      title: "Attach deliverable",
      description:
        "Attach text content, an optional diff and source URL to this agent's running task; requires files:write.",
      inputSchema: toolSchema(mcpFilesAttachArgs),
    },
    ({ runId, ...input }) =>
      run(() => core.attachRunArtifact(principal, runId, input)),
  );
  server.registerTool(
    "runs.submit",
    {
      title: "Submit agent run",
      description:
        "Submit actual artifacts for human review. Only the configured review policy can allow completion without review.",
      inputSchema: toolSchema(mcpRunsSubmitArgs),
    },
    ({ runId, ...input }) => run(() => core.submitRun(principal, runId, input)),
  );
  server.registerTool(
    "grants.request",
    {
      title: "Request permission",
      description:
        "Request a scoped, expiring grant. A person must decide; deny and token scopes remain binding.",
      inputSchema: toolSchema(mcpGrantsRequestArgs),
    },
    ({ agentId, ...input }) =>
      run(() => core.requestGrant(principal, agentId, input)),
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
    { responseMode: "json", maxRequestBodySize: 1_048_576 },
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
