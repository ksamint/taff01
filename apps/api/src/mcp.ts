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
import apiPackage from "../package.json";

/** zod/mini schemas validate but carry no JSON Schema; the SDK needs both. */
export function toolSchema<T extends $ZodType>(
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
  mcpContextGetArgs,
  mcpFilesAttachArgs,
  mcpGrantsRequestArgs,
  mcpInboxRequestReviewArgs,
  mcpProjectsCreateArgs,
  mcpProjectsEditArgs,
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
import { ADDITIVE, READ_ONLY, UPDATE } from "./mcp-annotations";
import { registerCrmTools } from "./mcp-crm";
import { registerInsightTools } from "./mcp-insights";
import { registerTimelineTools } from "./mcp-timeline";

type AgentPrincipal = Extract<Principal, { kind: "agent" }>;
export type CallState = {
  failed?: McpCall["status"];
  principal?: AgentPrincipal;
};
type ErrorLogger = { error(details: object, message: string): void };

function ok(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: { result: payload } as Record<string, unknown>,
  };
}
function failure(
  error: unknown,
  state: CallState,
  logger?: ErrorLogger,
): CallToolResult {
  const code = error instanceof CoreError ? error.code : "internal_error";
  if (!(error instanceof CoreError))
    logger?.error(
      { errorName: error instanceof Error ? error.name : typeof error },
      "MCP tool failed",
    );
  state.failed = code === "forbidden" ? "denied" : "error";
  return { isError: true, content: [{ type: "text", text: code }] };
}

/** One MCP server per request, bound to the token's agent and workspace. */
export function createMcpServer(
  core: Core,
  tokenPrincipal: AgentPrincipal,
  state: CallState,
  logger?: ErrorLogger,
) {
  const server = new McpServer({ name: "taff", version: apiPackage.version });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return ok(await fn());
    } catch (error) {
      return failure(error, state, logger);
    }
  };
  server.registerTool(
    "workspaces.list",
    {
      title: "List authorized workspaces",
      description:
        "List only this token's currently authorized workspaces. Omitting workspaceId on other tools uses its original default workspace.",
      inputSchema: toolSchema(mcpContextGetArgs),
      annotations: READ_ONLY,
    },
    () => run(() => core.listAgentWorkspaces(tokenPrincipal)),
  );
  server.registerTool(
    "context.get",
    {
      title: "Read workspace context",
      description:
        "Read the current instant, workspace display time zone (the token creator's saved user profile), calling member, default human owner, members and projects. Call before resolving relative dates such as today, tomorrow 3pm, Friday or next Monday, or names such as Alice. Resolve wall times in workspace.timeZone, then send ISO instants; never assume the client clock or UTC is the workspace zone. No data is changed.",
      inputSchema: toolSchema(mcpContextGetArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((_unused: Args) =>
          execute(() => core.getContext(principal, principal.workspaceId)))(
          args,
        );
      }),
  );
  server.registerTool(
    "tasks.list",
    {
      title: "List tasks",
      description: "Read and filter the workspace's tasks.",
      inputSchema: toolSchema(mcpTasksListArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((args: Args) =>
          execute(() =>
            core.listTasks(principal, principal.workspaceId, args),
          ))(args);
      }),
  );
  server.registerTool(
    "tasks.create",
    {
      title: "Create task",
      description:
        "Create a task owned by a person; the calling agent becomes its worker.",
      inputSchema: toolSchema(mcpTasksCreateArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((args: Args) =>
          execute(() =>
            core.createTask(principal, {
              workspaceId: principal.workspaceId,
              ...args,
              workerId: principal.memberId,
            }),
          ))(args);
      }),
  );
  server.registerTool(
    "tasks.update",
    {
      title: "Update task",
      description:
        "Update the status (in_progress or needs_review) or worker of a task the agent works on.",
      inputSchema: toolSchema(mcpTasksUpdateArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((args: Args) =>
          // Worker and status change together or not at all.
          execute(() =>
            core.updateTaskWork(principal, args.taskId, {
              workerId: args.workerId,
              status: args.status,
            }),
          ))(args);
      }),
  );
  server.registerTool(
    "tasks.edit",
    {
      title: "Edit task fields",
      description:
        "Edit the calling agent's task using its current version. Human review rules still apply.",
      inputSchema: toolSchema(mcpTasksEditArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ taskId, ...input }: Args) =>
          execute(() => core.updateTask(principal, taskId, input)))(args);
      }),
  );
  server.registerTool(
    "tasks.comments.list",
    {
      title: "Read task comments",
      description: "Read comments on an authorized workspace task.",
      inputSchema: toolSchema(mcpTaskCommentsListArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ taskId }: Args) =>
          execute(() => core.listTaskComments(principal, taskId)))(args);
      }),
  );
  server.registerTool(
    "tasks.comments.add",
    {
      title: "Comment on task",
      description:
        "Add an actual comment to the calling agent's assigned task.",
      inputSchema: toolSchema(mcpTaskCommentsAddArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ taskId, ...input }: Args) =>
          execute(() => core.addTaskComment(principal, taskId, input)))(args);
      }),
  );
  for (const [name, schema] of [
    ["projects.create", mcpProjectsCreateArgs],
    ["projects.edit", mcpProjectsEditArgs],
  ] as const) {
    server.registerTool(
      name,
      {
        title: "Prepare project change",
        description:
          "Prepare only. No project is changed. Show the exact returned arguments to the human controller for confirmation, then submit the existing signed approved-operation envelope with the original agent token. expected_version is null for creation and the current project version for editing. Money uses explicit currency and decimal strings; receivedAmount is cumulative actual collection and cannot decrease. Unknown outcomes must reconcile the identical signed receipt.",
        inputSchema: toolSchema(schema),
        annotations: READ_ONLY,
      },
      (workspaceArgs) =>
        run(async () => {
          const { workspaceId, ...args } = workspaceArgs;
          type Args = typeof args;
          const principal = await core.resolveAgentWorkspace(
            tokenPrincipal,
            workspaceId,
          );
          state.principal = principal;
          const execute = (fn: () => Promise<unknown>) => fn();
          return ((input: Args) =>
            execute(() =>
              core.prepareProjectOperation(principal, name, input),
            ))(args);
        }),
    );
  }
  server.registerTool(
    "projects.list",
    {
      title: "Read projects",
      description:
        "List the token workspace's projects with their stage (lead, proposal_sent, contract_signed, in_service, closed or null) and person in charge (leadId, a person member; resolve names with context.get). Contract and collection figures require tasks:read plus explicitly granted projects.manage; otherwise they remain null. Project mutations require separately granted projects.manage capability and a human-confirmed signed operation; project MCP write tools only prepare proposals.",
      inputSchema: toolSchema(mcpProjectsListArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((_unused: Args) =>
          execute(() => core.listProjects(principal, principal.workspaceId)))(
          args,
        );
      }),
  );
  server.registerTool(
    "search.query",
    {
      title: "Search tasks and comments",
      description:
        "Search authorized tasks and comments; an agent remains limited to its token workspace.",
      inputSchema: toolSchema(mcpSearchArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((input: Args) =>
          execute(() => core.search(principal, principal.workspaceId, input)))(
          args,
        );
      }),
  );
  server.registerTool(
    "quickadd.parse",
    {
      title: "Parse a task draft",
      description:
        "Parse editable task fields in the saved time zone without creating a task.",
      inputSchema: toolSchema(mcpQuickAddArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((input: Args) =>
          execute(() =>
            core.parseQuickAdd(principal, principal.workspaceId, input),
          ))(args);
      }),
  );
  server.registerTool(
    "calendar.list",
    {
      title: "Read calendar",
      description:
        "Read bounded calendar occurrences and unscheduled tasks in the token workspace.",
      inputSchema: toolSchema(mcpCalendarListArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((input: Args) =>
          execute(() =>
            core.listCalendar(principal, principal.workspaceId, input),
          ))(args);
      }),
  );
  server.registerTool(
    "calendar.set",
    {
      title: "Edit calendar schedule",
      description:
        "Set or clear a calendar interval and whole-series recurrence using the task's current version. Its deadline stays unchanged.",
      inputSchema: toolSchema(mcpCalendarSetArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ taskId, ...input }: Args) =>
          execute(() => core.setTaskCalendar(principal, taskId, input)))(args);
      }),
  );
  server.registerTool(
    "calendar.schedule",
    {
      title: "Schedule task",
      description:
        "Set or clear a task deadline (legacy protocol). Use calendar.set for calendar intervals and recurrence.",
      inputSchema: toolSchema(mcpCalendarScheduleArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((args: Args) =>
          execute(() =>
            core.scheduleTask(principal, args.taskId, { dueAt: args.dueAt }),
          ))(args);
      }),
  );
  server.registerTool(
    "inbox.request_review",
    {
      title: "Request review",
      description:
        "Hand the task to its owner for review; it waits in needs_review until a person approves.",
      inputSchema: toolSchema(mcpInboxRequestReviewArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return ((args: Args) =>
          execute(() =>
            core.requestReview(principal, args.taskId, { note: args.note }),
          ))(args);
      }),
  );
  server.registerTool(
    "runs.get",
    {
      title: "Read agent run",
      description:
        "Read real steps, tool calls, sources, tests and artifacts for a run.",
      inputSchema: toolSchema(mcpRunsGetArgs),
      annotations: READ_ONLY,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ runId }: Args) =>
          execute(() => core.getRun(principal, runId)))(args);
      }),
  );
  server.registerTool(
    "runs.start",
    {
      title: "Start agent run",
      description:
        "Start a run for a task assigned to this agent. Progress is submitted explicitly.",
      inputSchema: toolSchema(mcpRunsStartArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ taskId }: Args) =>
          execute(() => core.startRun(principal, taskId, {})))(args);
      }),
  );
  server.registerTool(
    "runs.control",
    {
      title: "Control agent run",
      description:
        "Pause, resume or cancel this agent's run using its current version.",
      inputSchema: toolSchema(mcpRunsControlArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ runId, ...input }: Args) =>
          execute(() => core.controlRun(principal, runId, input)))(args);
      }),
  );
  server.registerTool(
    "runs.event",
    {
      title: "Record agent progress",
      description:
        "Record a real step, tool call, source or test with measured duration and cost.",
      inputSchema: toolSchema(mcpRunsEventArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ runId, ...input }: Args) =>
          execute(() => core.appendRunEvent(principal, runId, input)))(args);
      }),
  );
  server.registerTool(
    "files.attach",
    {
      title: "Attach deliverable",
      description:
        "Attach text content, an optional diff and source URL to this agent's running task; requires files:write.",
      inputSchema: toolSchema(mcpFilesAttachArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ runId, ...input }: Args) =>
          execute(() => core.attachRunArtifact(principal, runId, input)))(args);
      }),
  );
  server.registerTool(
    "runs.submit",
    {
      title: "Submit agent run",
      description:
        "Submit this run for human review using its current version. Requires at least one artifact already attached with files.attach; a runs.event progress message is not an artifact. When the user only reports progress, attach an accurately attributed text progress note, never invented report content, then submit with the updated run version. Only the configured review policy can allow completion without review.",
      inputSchema: toolSchema(mcpRunsSubmitArgs),
      annotations: UPDATE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ runId, ...input }: Args) =>
          execute(() => core.submitRun(principal, runId, input)))(args);
      }),
  );
  server.registerTool(
    "grants.request",
    {
      title: "Request permission",
      description:
        "Request a scoped, expiring grant. A person must decide; deny and token scopes remain binding.",
      inputSchema: toolSchema(mcpGrantsRequestArgs),
      annotations: ADDITIVE,
    },
    (workspaceArgs) =>
      run(async () => {
        const { workspaceId, ...args } = workspaceArgs;
        type Args = typeof args;
        const principal = await core.resolveAgentWorkspace(
          tokenPrincipal,
          workspaceId,
        );
        state.principal = principal;
        const execute = (fn: () => Promise<unknown>) => fn();
        return (({ agentId, ...input }: Args) =>
          execute(() => core.requestGrant(principal, agentId, input)))(args);
      }),
  );
  registerTimelineTools(server, core, tokenPrincipal, run, state);
  registerCrmTools(server, core, tokenPrincipal, run, state);
  registerInsightTools(server, core, tokenPrincipal, run, state);
  return server;
}

export function createMcpHttpHandler(core: Core, logger?: ErrorLogger) {
  return createMcpHandler(
    (ctx) => {
      const extra = ctx.authInfo?.extra as
        | { principal: AgentPrincipal; state: CallState }
        | undefined;
      if (!extra) throw new CoreError("unauthorized", 401);
      return createMcpServer(core, extra.principal, extra.state, logger);
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
  const method = message.method;
  const tool = message.params?.name;
  // The log keeps bounded identifiers only; anything else is recorded as unknown.
  return {
    method:
      typeof method === "string" && /^[A-Za-z][\w./-]{0,63}$/.test(method)
        ? method
        : "invalid",
    tool:
      typeof tool === "string" && /^[\w.-]{1,100}$/.test(tool) ? tool : null,
  };
}
