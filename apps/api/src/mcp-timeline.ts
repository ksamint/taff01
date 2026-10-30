import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import {
  mcpDependenciesAddArgs,
  mcpDependenciesRemoveArgs,
  mcpTasksPlanArgs,
  mcpTimelineGetArgs,
} from "@taff/schemas";
import { type CallState, toolSchema } from "./mcp";
import { ADDITIVE, READ_ONLY, UPDATE } from "./mcp-annotations";

type AgentPrincipal = Extract<Principal, { kind: "agent" }>;

/**
 * Timeline tools (ADR 0015). Core enforces every gate: reads need tasks:read
 * (workspace:read), plans need calendar:write on the agent's own work
 * (task:schedule), links need tasks:write as the successor's worker
 * (dependency:edit). Milestones and finance stay human-only.
 */
export function registerTimelineTools(
  server: McpServer,
  core: Core,
  tokenPrincipal: AgentPrincipal,
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>,
  state: CallState,
) {
  server.registerTool(
    "timeline.get",
    {
      title: "Read project timeline",
      description:
        "Read a project's plan: spans, progress, dependencies, conflicts, critical path and risk. Finance is never shown to agents.",
      inputSchema: toolSchema(mcpTimelineGetArgs),
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
        return (({ projectId }: Args) =>
          execute(() => core.getTimeline(principal, projectId)))(args);
      }),
  );
  server.registerTool(
    "tasks.plan",
    {
      title: "Plan task dates",
      description:
        "Set the start date and duration of a task this agent works on, using the plan's current version (omit it for a new plan). The deadline follows the last day; shiftChildren moves the whole subtree.",
      inputSchema: toolSchema(mcpTasksPlanArgs),
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
          execute(() => core.setTaskPlan(principal, taskId, input)))(args);
      }),
  );
  server.registerTool(
    "dependencies.add",
    {
      title: "Add dependency",
      description:
        "Make a task this agent works on wait for another task or milestone (finish-to-start). Duplicates and cycles are refused.",
      inputSchema: toolSchema(mcpDependenciesAddArgs),
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
        return ((input: Args) =>
          execute(() => core.addDependency(principal, input)))(args);
      }),
  );
  server.registerTool(
    "dependencies.remove",
    {
      title: "Remove dependency",
      description:
        "Remove a dependency into a task this agent works on; the removed link is returned so it can be re-added.",
      inputSchema: toolSchema(mcpDependenciesRemoveArgs),
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
        return (({ dependencyId }: Args) =>
          execute(() => core.removeDependency(principal, dependencyId)))(args);
      }),
  );
}
