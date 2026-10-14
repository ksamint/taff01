import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import {
  mcpDependenciesAddArgs,
  mcpDependenciesRemoveArgs,
  mcpTasksPlanArgs,
  mcpTimelineGetArgs,
} from "@taff/schemas";
import { toolSchema } from "./mcp";

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
  principal: AgentPrincipal,
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>,
) {
  server.registerTool(
    "timeline.get",
    {
      title: "Read project timeline",
      description:
        "Read a project's plan: spans, progress, dependencies, conflicts, critical path and risk. Finance is never shown to agents.",
      inputSchema: toolSchema(mcpTimelineGetArgs),
    },
    ({ projectId }) => run(() => core.getTimeline(principal, projectId)),
  );
  server.registerTool(
    "tasks.plan",
    {
      title: "Plan task dates",
      description:
        "Set the start date and duration of a task this agent works on, using the plan's current version (omit it for a new plan). The deadline follows the last day; shiftChildren moves the whole subtree.",
      inputSchema: toolSchema(mcpTasksPlanArgs),
    },
    ({ taskId, ...input }) =>
      run(() => core.setTaskPlan(principal, taskId, input)),
  );
  server.registerTool(
    "dependencies.add",
    {
      title: "Add dependency",
      description:
        "Make a task this agent works on wait for another task or milestone (finish-to-start). Duplicates and cycles are refused.",
      inputSchema: toolSchema(mcpDependenciesAddArgs),
    },
    (input) => run(() => core.addDependency(principal, input)),
  );
  server.registerTool(
    "dependencies.remove",
    {
      title: "Remove dependency",
      description:
        "Remove a dependency into a task this agent works on; the removed link is returned so it can be re-added.",
      inputSchema: toolSchema(mcpDependenciesRemoveArgs),
    },
    ({ dependencyId }) =>
      run(() => core.removeDependency(principal, dependencyId)),
  );
}
