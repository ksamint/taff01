import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import {
  mcpSummariesGetArgs,
  mcpSummariesImageArgs,
  mcpSummariesListArgs,
} from "@taff/schemas";
import { type CallState, toolSchema } from "./mcp";
import { READ_ONLY } from "./mcp-annotations";
export function registerSummaryTools(
  server: McpServer,
  core: Core,
  tokenPrincipal: Extract<Principal, { kind: "agent" }>,
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>,
  runResult: (fn: () => Promise<CallToolResult>) => Promise<CallToolResult>,
  state: CallState,
) {
  async function resolve(workspaceId?: string) {
    const principal = await core.resolveAgentWorkspace(
      tokenPrincipal,
      workspaceId,
    );
    state.principal = principal;
    return principal;
  }
  server.registerTool(
    "summaries.list",
    {
      title: "List daily summaries",
      description:
        "Read recipient-watermarked daily summaries in an authorized workspace. Requires summaries:read. Omitting workspaceId uses the token home workspace.",
      inputSchema: toolSchema(mcpSummariesListArgs),
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const { workspaceId, ...query } = args;
        const p = await resolve(workspaceId);
        return core.listDailySummaries(p, p.workspaceId, query);
      }),
  );
  server.registerTool(
    "summaries.get",
    {
      title: "Read daily summary",
      description:
        "Read an immutable recipient-watermarked summary as JSON or text. Requires summaries:read. Omitting workspaceId uses the token home workspace.",
      inputSchema: toolSchema(mcpSummariesGetArgs),
      annotations: READ_ONLY,
    },
    (args) =>
      runResult(async () => {
        const p = await resolve(args.workspaceId);
        if (args.format === "txt") {
          const render = await core.getSummaryRender(p, args.summaryId, "txt");
          return { content: [{ type: "text", text: render.body! }] };
        }
        return run(() => core.getDailySummary(p, args.summaryId));
      }),
  );
  server.registerTool(
    "summaries.image",
    {
      title: "Read daily summary image",
      description:
        "Read a recipient-watermarked summary as a PNG image content block. Requires summaries:read. Omitting workspaceId uses the token home workspace.",
      inputSchema: toolSchema(mcpSummariesImageArgs),
      annotations: READ_ONLY,
    },
    (args) =>
      runResult(async () => {
        const p = await resolve(args.workspaceId);
        const render = await core.getSummaryRender(p, args.summaryId, "png");
        return {
          content: [
            { type: "image", mimeType: "image/png", data: render.data! },
          ],
        };
      }),
  );
}
