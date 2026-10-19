import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import {
  mcpBriefGetArgs,
  mcpRelationsGetArgs,
  mcpSuggestionsCreateArgs,
} from "@taff/schemas";
import { toolSchema } from "./mcp";
import { ADDITIVE, READ_ONLY } from "./mcp-annotations";

/**
 * Phase B read and proposal tools (M16–M17). Core enforces every gate:
 * relations.get needs tasks:read (workspace:read) and shows CRM nodes only
 * with contact:read; contact phone and email never enter the graph. brief.get
 * reads the token workspace (finance is never shown to agents). An agent can
 * only propose (suggestions.create); a person applies. There is no ask tool.
 */
export function registerInsightTools(
  server: McpServer,
  core: Core,
  principal: Extract<Principal, { kind: "agent" }>,
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>,
) {
  server.registerTool(
    "relations.get",
    {
      title: "Read relations graph",
      description:
        "Read the token workspace's relations: projects, tasks, people, agents and dependencies, plus CRM companies and contacts only with the crm.read capability (never phone or email). Optional projectId and layers (people, dependencies, org, crm).",
      inputSchema: toolSchema(mcpRelationsGetArgs),
      annotations: READ_ONLY,
    },
    (args) =>
      run(() => core.relationGraph(principal, principal.workspaceId, args)),
  );
  server.registerTool(
    "brief.get",
    {
      title: "Read the brief",
      description:
        "Read the token workspace's deterministic brief: each project's stage, person in charge (leadId), risk level and reason codes, slip and delivery %, and counts of reviews waiting, blocked agents, tasks due today and agents working. Codes and numbers only; finance is never shown to agents.",
      inputSchema: toolSchema(mcpBriefGetArgs),
      annotations: READ_ONLY,
    },
    () =>
      run(() =>
        core.getBrief(principal, {
          scope: "workspace",
          workspaceId: principal.workspaceId,
        }),
      ),
  );
  server.registerTool(
    "suggestions.create",
    {
      title: "Propose a split or reschedule",
      description:
        "Propose splitting a task this agent works on into 1–10 subtasks, or moving its plan (startDate, durationDays). A person applies or dismisses the proposal; nothing changes until then. Needs tasks:write.",
      inputSchema: toolSchema(mcpSuggestionsCreateArgs),
      annotations: ADDITIVE,
    },
    (input) => run(() => core.createSuggestion(principal, input)),
  );
}
