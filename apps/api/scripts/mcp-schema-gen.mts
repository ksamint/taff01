// Emits the MCP tool argument schemas as JSON Schema (jsonSchema7), the
// single machine-readable contract the Rust backend consumes (ADR 0026).
// Run from the repo root with:
//   node --env-file=.env node_modules/tsx/dist/cli.mjs apps/api/scripts/mcp-schema-gen.mts > backend/crates/taff-core/tests/fixtures/mcp-tools.json
import { toJSONSchema } from "zod/v4/core";
import {
  mcpBriefGetArgs,
  mcpSuggestionsCreateArgs,
} from "../../../packages/schemas/src/assistant";
import {
  mcpCompaniesListArgs,
  mcpContactsGetArgs,
  mcpContactsListArgs,
} from "../../../packages/schemas/src/crm";
import { mcpRelationsGetArgs } from "../../../packages/schemas/src/graph";
import {
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
} from "../../../packages/schemas/src/index";
import {
  mcpDependenciesAddArgs,
  mcpDependenciesRemoveArgs,
  mcpTasksPlanArgs,
  mcpTimelineGetArgs,
} from "../../../packages/schemas/src/plan";

// Tool name -> input-argument schema, mirroring createMcpServer in apps/api.
const tools: Record<string, unknown> = {
  "workspaces.list": mcpContextGetArgs,
  "context.get": mcpContextGetArgs,
  "tasks.list": mcpTasksListArgs,
  "tasks.create": mcpTasksCreateArgs,
  "tasks.update": mcpTasksUpdateArgs,
  "tasks.edit": mcpTasksEditArgs,
  "tasks.comments.list": mcpTaskCommentsListArgs,
  "tasks.comments.add": mcpTaskCommentsAddArgs,
  "projects.create": mcpProjectsCreateArgs,
  "projects.edit": mcpProjectsEditArgs,
  "projects.list": mcpProjectsListArgs,
  "search.query": mcpSearchArgs,
  "quickadd.parse": mcpQuickAddArgs,
  "calendar.list": mcpCalendarListArgs,
  "calendar.schedule": mcpCalendarScheduleArgs,
  "calendar.set": mcpCalendarSetArgs,
  "files.attach": mcpFilesAttachArgs,
  "grants.request": mcpGrantsRequestArgs,
  "runs.start": mcpRunsStartArgs,
  "runs.get": mcpRunsGetArgs,
  "runs.control": mcpRunsControlArgs,
  "runs.event": mcpRunsEventArgs,
  "runs.submit": mcpRunsSubmitArgs,
  "inbox.request_review": mcpInboxRequestReviewArgs,
  "companies.list": mcpCompaniesListArgs,
  "contacts.list": mcpContactsListArgs,
  "contacts.get": mcpContactsGetArgs,
  "relations.get": mcpRelationsGetArgs,
  "brief.get": mcpBriefGetArgs,
  "suggestions.create": mcpSuggestionsCreateArgs,
  "timeline.get": mcpTimelineGetArgs,
  "tasks.plan": mcpTasksPlanArgs,
  "dependencies.add": mcpDependenciesAddArgs,
  "dependencies.remove": mcpDependenciesRemoveArgs,
};

const out: Record<string, unknown> = {};
for (const [name, schema] of Object.entries(tools)) {
  out[name] = toJSONSchema(schema as never, {
    target: "jsonSchema7",
    io: "input",
  });
}

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
