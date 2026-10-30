import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { Core, Principal } from "@taff/core";
import {
  mcpCompaniesListArgs,
  mcpContactsGetArgs,
  mcpContactsListArgs,
} from "@taff/schemas";
import { type CallState, toolSchema } from "./mcp";
import { READ_ONLY } from "./mcp-annotations";

/**
 * Read-only CRM tools (ADR 0015). Core enforces `contact:read`: the token's
 * tasks:read scope plus the crm.read capability a person allows or grants.
 * Phone and email stay null without crm.contact_details. No write tool ships.
 */
export function registerCrmTools(
  server: McpServer,
  core: Core,
  tokenPrincipal: Extract<Principal, { kind: "agent" }>,
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>,
  state: CallState,
) {
  server.registerTool(
    "companies.list",
    {
      title: "List companies",
      description:
        "List the token workspace's CRM companies. Needs the crm.read capability.",
      inputSchema: toolSchema(mcpCompaniesListArgs),
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
            core.listCompanies(principal, principal.workspaceId, args),
          ))(args);
      }),
  );
  server.registerTool(
    "contacts.list",
    {
      title: "List contacts",
      description:
        "List or search CRM contacts. Phone and email are null unless crm.contact_details is allowed.",
      inputSchema: toolSchema(mcpContactsListArgs),
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
            core.listContacts(principal, principal.workspaceId, args),
          ))(args);
      }),
  );
  server.registerTool(
    "contacts.get",
    {
      title: "Read contact",
      description:
        "Read one contact with its company and every company, project and task link with roles.",
      inputSchema: toolSchema(mcpContactsGetArgs),
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
        return (({ contactId }: Args) =>
          execute(() => core.getContactDetail(principal, contactId)))(args);
      }),
  );
}
