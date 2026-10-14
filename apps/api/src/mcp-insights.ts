import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import { mcpRelationsGetArgs } from "@taff/schemas";
import { toolSchema } from "./mcp";

/**
 * Phase B read and proposal tools (M16–M17). Core enforces every gate:
 * relations.get needs tasks:read (workspace:read) and shows CRM nodes only
 * with contact:read; contact phone and email never enter the graph.
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
    },
    (args) =>
      run(() => core.relationGraph(principal, principal.workspaceId, args)),
  );
}
