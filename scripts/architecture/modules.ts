// The mapping: which function module owns each table, core file, route, MCP
// tool, page and screen component. `architecture.test.ts` fails when the code
// gains something that no module claims, or when two modules claim one thing.
export type ModuleMap = {
  id: string;
  title: string;
  summary: string;
  /** SQL table names. */
  tables: string[];
  /** File names in packages/core/src. */
  core: string[];
  /** REST paths; the first module whose pattern matches owns the route. */
  routes: RegExp[];
  /** MCP tool names. */
  tools: RegExp[];
  /** Page routes of apps/web/app. */
  pages: RegExp[];
  /** Screen components in apps/web/src/components that are not pages. */
  components?: string[];
  /** Other source files that belong here. */
  sources?: string[];
};

// Order matters for routes, tools and pages: specific modules come before the
// general ones that would otherwise swallow their paths.
export const MODULES: ModuleMap[] = [
  {
    id: "planning",
    title: "Planning (Gantt)",
    summary:
      "Start and duration per task, milestones and dependencies. Computes the critical path, forecast and project risk on read.",
    tables: ["task_plans", "milestones", "task_dependencies"],
    core: ["timeline.ts", "plan-model.ts"],
    routes: [
      /^\/api\/projects\/:id\/(timeline|milestones)$/,
      /^\/api\/tasks\/:id\/plan$/,
      /^\/api\/milestones/,
      /^\/api\/dependencies/,
    ],
    tools: [/^timeline\./, /^tasks\.plan$/, /^dependencies\./],
    pages: [],
    components: ["timeline-view.tsx", "timeline-scene.tsx"],
    sources: [
      "apps/web/src/lib/timeline-geometry.ts",
      "backend/crates/taff-render/src/timeline.rs",
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    summary:
      "Time blocks for tasks, with recurrence, and the unscheduled tray.",
    tables: ["task_calendar"],
    core: ["calendar.ts", "calendar-recurrence.ts"],
    routes: [/^\/api\/calendar/, /^\/api\/tasks\/:id\/(calendar|schedule)$/],
    tools: [/^calendar\./],
    pages: [/^\/calendar$/],
    sources: ["backend/crates/taff-render/src/calendar.rs"],
  },
  {
    id: "agents",
    title: "Agents, runs and review",
    summary:
      "An agent works a task as a run, records events and deliverables, and waits for a person to approve.",
    tables: [
      "agent_profiles",
      "agent_permissions",
      "runs",
      "run_events",
      "run_artifacts",
      "grants",
      "review_checks",
      "review_comments",
      "review_items",
      "trusted_review_receipts",
      "approved_agent_receipts",
    ],
    core: [
      "runs.ts",
      "trusted-review.ts",
      "approved-agent-operation.ts",
      "default-agents.ts",
    ],
    routes: [
      /^\/api\/runs/,
      /^\/api\/agents/,
      /^\/api\/grants/,
      /^\/api\/trusted-reviews/,
      /^\/api\/tasks\/:id\/(runs|review)$/,
    ],
    tools: [/^runs\./, /^grants\./, /^inbox\.request_review$/, /^files\./],
    pages: [/^\/agents\/:id$/, /^\/tasks\/:id\/review$/],
    components: ["run-panel.tsx"],
  },
  {
    id: "access",
    title: "Access: tokens, OAuth and MCP",
    summary:
      "How an outside agent connects: OAuth approval, token scopes per organization, the permission function and the call log.",
    tables: [
      "agent_tokens",
      "agent_token_workspaces",
      "oauth_clients",
      "oauth_codes",
      "oauth_refresh_history",
      "mcp_calls",
    ],
    core: ["oauth.ts", "token-policy.ts", "access-matrix.ts", "permissions.ts"],
    routes: [
      /^\/api\/agent-tokens/,
      /^\/api\/agent-token-workspaces/,
      /^\/api\/oauth/,
      /^\/\.well-known\//,
      /^\/mcp$/,
      /^\/api\/mcp-calls/,
      /^\/api\/workspaces\/:id\/access/,
      /^\/api\/tasks\/:id\/access$/,
      /^\/api\/admin\/(access-matrix|agent-tokens|integrations)/,
    ],
    tools: [/^context\./],
    pages: [
      /^\/me\/mcp$/,
      /^\/orgs\/access$/,
      /^\/admin\/access$/,
      /^\/oauth\//,
    ],
  },
  {
    id: "inbox",
    title: "Inbox and notifications",
    summary:
      "Mentions, blocked agents and reviews; preferences; the personal daily digest.",
    tables: ["inbox_items", "notification_preferences", "daily_digests"],
    core: ["notifications.ts", "notifications-time.ts"],
    routes: [/^\/api\/inbox/, /^\/api\/me\/notifications/, /^\/api\/digests/],
    tools: [],
    pages: [/^\/inbox$/, /^\/me\/notifications$/, /^\/digests/],
    sources: ["apps/worker/src/digests.ts"],
  },
  {
    id: "summaries",
    title: "Shareholder summaries",
    summary:
      "A daily project summary per audience, as text and image, with expiring share links.",
    tables: [
      "audience_tags",
      "project_audience_tags",
      "audience_recipients",
      "daily_summaries",
      "summary_shares",
      "summary_renders",
    ],
    core: [
      "summaries.ts",
      "summary-model.ts",
      "summary-renders.ts",
      "summary-layout.ts",
      "summary-messages.ts",
      "summary-text.ts",
    ],
    routes: [
      /^\/api\/summaries/,
      /^\/api\/audience-/,
      /^\/api\/summary-shares/,
      /^\/api\/shared-summary/,
      /\/audience-tags/,
      /\/summar/,
    ],
    tools: [/^summaries\./],
    pages: [/^\/orgs\/summaries$/, /^\/summaries/, /^\/s\/:token$/],
    sources: [
      "apps/worker/src/summaries.ts",
      "backend/crates/taff-render/src/designed.rs",
    ],
  },
  {
    id: "crm",
    title: "Companies and contacts",
    summary:
      "Client and partner companies, people, and their roles on a company, project or task.",
    tables: [
      "companies",
      "contacts",
      "company_contacts",
      "project_contacts",
      "task_contacts",
      "contact_roles",
    ],
    core: ["crm.ts"],
    routes: [
      /^\/api\/(companies|contacts|crm)/,
      /\/(contacts|stakeholders|contact-roles)/,
      /\/crm\//,
    ],
    tools: [/^companies\./, /^contacts\./],
    pages: [/^\/companies/, /^\/contacts/],
    components: ["crm/stakeholders-view.tsx"],
  },
  {
    id: "relations",
    title: "Relations graph",
    summary:
      "One picture of people, agents, tasks, projects, companies and contacts. A read model that stores nothing.",
    tables: [],
    core: ["relations.ts", "relation-graph.ts"],
    routes: [/^\/api\/workspaces\/:id\/graph$/],
    tools: [/^relations\./],
    pages: [],
    components: ["relations-view.tsx"],
    sources: ["backend/crates/taff-render/src/graph.rs"],
  },
  {
    id: "mind",
    title: "Mind map",
    summary: "Layered nodes with evidence sources; a node can link to a task.",
    tables: ["mind_nodes", "mind_edges", "mind_sources", "mind_node_sources"],
    core: ["mind.ts", "prototype-mind.ts"],
    routes: [/\/mind(\/|$)/],
    tools: [],
    pages: [],
    components: ["mind-view.tsx"],
  },
  {
    id: "sectors",
    title: "Sectors (operation template)",
    summary:
      "Regroups tasks by six sector labels. A view over task labels; nothing is stored.",
    tables: [],
    core: [],
    routes: [],
    tools: [],
    pages: [],
    sources: [
      "packages/schemas/src/operation-templates.ts",
      "apps/web/src/lib/xiding-setup-order.ts",
    ],
  },
  {
    id: "assistant",
    title: "AI brief, Ask and suggestions",
    summary:
      "Rule-based daily brief and answers, an optional model path per organization, and suggestions a person applies or undoes.",
    tables: ["suggestions"],
    core: [
      "assistant.ts",
      "brief.ts",
      "ask.ts",
      "ai-provider.ts",
      "suggestions.ts",
    ],
    routes: [/^\/api\/(brief|ask|suggestions)/, /\/suggestions$/, /\/ai$/],
    tools: [/^brief\./, /^suggestions\./],
    pages: [/^\/brief$/],
  },
  {
    id: "export",
    title: "Exported view images",
    summary:
      "Project, timeline, week, month, mind and relations as a watermarked PNG. Images are not stored.",
    tables: [],
    core: ["view-export.ts"],
    routes: [/\/view-image$/],
    tools: [/^views\./],
    pages: [],
    components: ["view-export.tsx"],
    sources: ["backend/crates/taff-render/src/main.rs"],
  },
  {
    id: "audit",
    title: "Audit and realtime",
    summary:
      "Every write records who did what; a database notification tells open browsers what to refresh.",
    tables: ["activity"],
    core: ["integration-audit.ts"],
    routes: [/^\/api\/admin\/audit/, /^\/api\/realtime$/],
    tools: [],
    pages: [/^\/orgs\/audit$/],
    sources: ["apps/api/src/realtime.ts", "apps/web/src/lib/realtime.ts"],
  },
  {
    id: "identity",
    title: "Sign-in and profile",
    summary: "Email, username, phone and SMS sign-in; locale and time zone.",
    tables: [
      "users",
      "sessions",
      "accounts",
      "verifications",
      "sms_auth_challenges",
      "sms_auth_limits",
    ],
    core: [
      "sms-auth.ts",
      "tencent-sms.ts",
      "email-verification.ts",
      "email.ts",
      "email-messages.ts",
      "actor-timezone.ts",
    ],
    routes: [/^\/api\/auth/, /^\/api\/me/, /^\/api\/profile/],
    tools: [],
    pages: [/^\/me$/],
  },
  {
    id: "orgs",
    title: "Organizations and members",
    summary:
      "Create, archive and restore an organization; invite people; set roles; the login default.",
    tables: ["workspaces", "members", "workspace_invites"],
    core: [
      "workspace-lifecycle.ts",
      "administration.ts",
      "provision-administration.ts",
      "cleanup-organizations.ts",
    ],
    routes: [
      /^\/api\/workspaces/,
      /^\/api\/members/,
      /^\/api\/workspace-invites/,
      /^\/api\/admin/,
      /^\/api\/users/,
    ],
    tools: [/^workspaces\./],
    pages: [/^\/orgs$/, /^\/admin$/],
  },
  {
    id: "projects",
    title: "Projects and finance",
    summary:
      "Project profile, stage, person in charge, contract amount and payments.",
    tables: ["projects", "project_payments", "project_updates"],
    core: ["planning.ts"],
    routes: [
      /^\/api\/projects/,
      /^\/api\/costs\/projects\//,
      /^\/api\/project-updates$/,
    ],
    tools: [/^projects\./],
    pages: [/^\/projects/],
    components: ["project-finance-panel.tsx"],
  },
  {
    id: "tasks",
    title: "Tasks",
    summary:
      "Create, edit, assign, comment and change status; subtasks; labels; Quick Add; search; Today.",
    tables: ["tasks", "task_comments"],
    core: ["quick-add.ts", "today-bootstrap.ts"],
    routes: [
      /^\/api\/tasks/,
      /^\/api\/costs\/tasks\//,
      /^\/api\/quick-add/,
      /^\/api\/search/,
      /^\/api\/bootstrap/,
    ],
    tools: [/^tasks\./, /^search\./, /^quickadd\./],
    pages: [/^\/$/, /^\/tasks\/:id$/],
    components: ["quick-add-dialog.tsx", "search-dialog.tsx"],
  },
  {
    id: "kernel",
    title: "Kernel",
    summary:
      "createCore wires every module and still holds the task, member and organization operations. Also migrations, seeds and health.",
    tables: [],
    core: [
      "index.ts",
      "migrate.ts",
      "seed.ts",
      "prototype-seed.ts",
      "mcp-benchmark.mts",
      "runtime-faults.mts",
    ],
    routes: [/^\/api\/health$/],
    tools: [],
    pages: [],
  },
];
