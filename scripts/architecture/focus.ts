// The focused layer of the architecture model: how modules are grouped, which
// permission actions and specifications belong to each, and the flows that
// cross them. Hand-written; `architecture.test.ts` checks every reference.

/** Lanes of the function map, top to bottom. Every module sits in one. */
export const GROUPS: { id: string; title: string; modules: string[] }[] = [
  {
    id: "work",
    title: "Work",
    modules: ["tasks", "projects", "planning", "calendar"],
  },
  {
    id: "agents",
    title: "Agents and attention",
    modules: ["agents", "access", "inbox"],
  },
  {
    id: "reporting",
    title: "Reporting",
    modules: ["assistant", "summaries", "export"],
  },
  {
    id: "context",
    title: "People and context",
    modules: ["crm", "relations", "mind", "sectors"],
  },
  {
    id: "platform",
    title: "Platform",
    modules: ["orgs", "identity", "audit", "kernel"],
  },
];

/** Permission actions by owner. First match wins; specific rules come first. */
export const ACTION_RULES: [RegExp, string][] = [
  [/^task:schedule$/, "calendar"],
  [/^task:review$/, "agents"],
  [/^task:/, "tasks"],
  [/^dependency:/, "planning"],
  [/^(project|finance):/, "projects"],
  [/^(run|grant|agent|files|review):/, "agents"],
  [/^(token|capability):/, "access"],
  [/^(inbox|notification|digest):/, "inbox"],
  [/^suggestion:/, "assistant"],
  [/^(summary|audience):/, "summaries"],
  [/^view:/, "export"],
  [/^(contact|crm):/, "crm"],
  [/^mind:/, "mind"],
  [/^workspace:/, "orgs"],
  [/^profile:/, "identity"],
];

/** Living specifications by module. An empty list means it cuts across all. */
export const SPEC_MODULES: Record<string, string[]> = {
  "access-matrix.md": ["access"],
  "agent-access.md": ["access", "agents"],
  "audit.md": ["audit"],
  "brief.md": ["assistant"],
  "client-navigation.md": [],
  "daily-summary.md": ["summaries"],
  "operation-templates.md": ["sectors"],
  "permissions-matrix.md": ["access"],
  "project-finance.md": ["projects"],
  "time-tracking.md": ["tasks"],
  "projects.md": ["projects"],
  "runtime.md": ["kernel"],
  "tooling.md": [],
  "view-export.md": ["export"],
  "workspaces.md": ["orgs"],
};

export const ROLES: { id: string; title: string; summary: string }[] = [
  {
    id: "admin",
    title: "Admin",
    summary:
      "Everything in the organization: members, projects, finance, tokens, agents, summaries, audit.",
  },
  {
    id: "member",
    title: "Member",
    summary:
      "Reads tasks, projects, finance and contacts. Creates tasks and comments. Edits what they own.",
  },
  {
    id: "guest",
    title: "Guest",
    summary:
      "Reads tasks, the relations graph and the mind map. No finance, no contacts, no writing.",
  },
  {
    id: "agent",
    title: "Agent",
    summary:
      "A member of kind agent. Limited by token scopes, its capabilities and temporary grants; finished work waits for a person.",
  },
];

/** Rights that come from a relationship, not from the organization role. */
export const RELATIONSHIP_ROLES: { title: string; summary: string }[] = [
  {
    title: "System administrator",
    summary:
      "A flag on the user. Opens /admin and holds admin membership in every organization.",
  },
  {
    title: "Project person in charge",
    summary: "May change the project's stage without being an admin.",
  },
  {
    title: "Task owner",
    summary:
      "Edits, assigns, schedules and plans the task, and approves its review.",
  },
  {
    title: "Task worker",
    summary: "A person or an agent. Moves the status, but not to done.",
  },
  {
    title: "Agent supervisor",
    summary: "Approves that agent's work and decides its permission requests.",
  },
];

export const LEVELS: {
  title: string;
  table: string;
  note: string;
  missing?: boolean;
}[] = [
  {
    title: "System",
    table: "users",
    note: "System administrator is a flag on the user.",
  },
  {
    title: "Group of organizations",
    table: "",
    note: "Nothing groups several organizations.",
    missing: true,
  },
  {
    title: "Organization",
    table: "workspaces, members",
    note: "Called workspace in code. One role per person: admin, member or guest.",
  },
  { title: "Project", table: "projects", note: "Flat. One person in charge." },
  {
    title: "Sub-project or phase",
    table: "",
    note: "A project has no parent and no children.",
    missing: true,
  },
  {
    title: "Task",
    table: "tasks",
    note: "Always an owner; may have a worker. Due, scheduled and planned dates are separate.",
  },
  {
    title: "Subtask",
    table: "tasks.parent_id",
    note: "A task whose parent is another task.",
  },
];

export type Flow = {
  id: string;
  title: string;
  /** `lane` is who acts in the step: Person, Agent or System. */
  steps: { lane: string; module: string; title: string; text: string }[];
};
export const FLOWS: Flow[] = [
  {
    id: "handoff",
    title: "A person hands work to an agent and approves it",
    steps: [
      {
        lane: "Person",
        module: "tasks",
        title: "Task",
        text: "A person creates a task and sets an agent as worker.",
      },
      {
        lane: "Agent",
        module: "agents",
        title: "Run",
        text: "The agent starts a run; events and deliverables are recorded.",
      },
      {
        lane: "System",
        module: "access",
        title: "Permission",
        text: "Each step is checked against scopes and capabilities. An “ask” capability pauses the run.",
      },
      {
        lane: "Person",
        module: "inbox",
        title: "Inbox",
        text: "The request, and later the finished work, reach the supervisor's inbox.",
      },
      {
        lane: "Person",
        module: "agents",
        title: "Review",
        text: "The owner or supervisor approves or asks for changes in the review workspace.",
      },
      {
        lane: "Person",
        module: "tasks",
        title: "Done",
        text: "Only a person moves the task to done.",
      },
    ],
  },
  {
    id: "plan",
    title: "A plan becomes a risk line and a report",
    steps: [
      {
        lane: "Person",
        module: "tasks",
        title: "Tasks",
        text: "Status, due dates and subtasks.",
      },
      {
        lane: "Person",
        module: "planning",
        title: "Plan",
        text: "Start, duration, milestones and dependencies; the model computes critical path, forecast and risk.",
      },
      {
        lane: "System",
        module: "assistant",
        title: "Brief",
        text: "The AI brief reports risk and finance per project.",
      },
      {
        lane: "System",
        module: "summaries",
        title: "Summary",
        text: "The shareholder summary reuses the same model.",
      },
      {
        lane: "System",
        module: "export",
        title: "Image",
        text: "The timeline exports as a watermarked PNG.",
      },
    ],
  },
  {
    id: "shareholder",
    title: "A project reaches a shareholder",
    steps: [
      {
        lane: "Person",
        module: "projects",
        title: "Project",
        text: "Progress, stage, contract and payments are kept on the project.",
      },
      {
        lane: "Person",
        module: "summaries",
        title: "Audience",
        text: "An admin creates an audience tag, adds recipients and tags projects.",
      },
      {
        lane: "System",
        module: "summaries",
        title: "Snapshot",
        text: "At each recipient's delivery time the worker stores a snapshot with a content hash.",
      },
      {
        lane: "System",
        module: "export",
        title: "Render",
        text: "Text in core, PNG from the Rust renderer, both watermarked.",
      },
      {
        lane: "Person",
        module: "identity",
        title: "Read",
        text: "The recipient signs in to read it, or an admin shares an expiring link.",
      },
    ],
  },
  {
    id: "connect",
    title: "An outside agent gets access",
    steps: [
      {
        lane: "Agent",
        module: "access",
        title: "Connect",
        text: "The agent's client opens the OAuth flow at /mcp.",
      },
      {
        lane: "Person",
        module: "orgs",
        title: "Role cap",
        text: "An admin approves scopes, never above their own role in that organization.",
      },
      {
        lane: "System",
        module: "access",
        title: "Token",
        text: "The token is tied to one agent member, with grants per organization.",
      },
      {
        lane: "Agent",
        module: "tasks",
        title: "Call",
        text: "Each tool call runs as that member through the same rules as a person.",
      },
      {
        lane: "System",
        module: "audit",
        title: "Record",
        text: "The call is logged and the write is audited.",
      },
    ],
  },
  {
    id: "refresh",
    title: "A change appears on another screen",
    steps: [
      {
        lane: "Person",
        module: "tasks",
        title: "Write",
        text: "REST or MCP calls core inside one transaction.",
      },
      {
        lane: "System",
        module: "kernel",
        title: "Core",
        text: "The mutation helper applies the rule and the version check.",
      },
      {
        lane: "System",
        module: "audit",
        title: "Audit",
        text: "A trigger writes the activity row and sends a notification with ids only.",
      },
      {
        lane: "System",
        module: "audit",
        title: "Socket",
        text: "The API forwards it to that organization's open browsers, which refetch what changed.",
      },
    ],
  },
];
