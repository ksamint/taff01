// Emits a golden table of `can(actor, action, resource)` decisions for the
// cases the Rust permissions port must match. Run from the repo root with:
//   node --env-file=.env node_modules/tsx/dist/cli.mjs apps/api/scripts/permissions-golden.mts > backend/crates/taff-core/tests/fixtures/permissions-golden.json
import {
  type Action,
  type Actor,
  can,
  type Resource,
} from "../../../packages/core/src/permissions";

const person: Actor = {
  id: "person",
  workspaceId: "ws",
  userId: "person",
  name: "Person",
  kind: "person",
  role: "member",
};
const agent: Actor = {
  id: "agent",
  workspaceId: "ws",
  userId: "agent",
  name: "Agent",
  kind: "agent",
  role: "member",
  scopes: [
    "tasks:read",
    "tasks:write",
    "calendar:write",
    "inbox:review",
    "files:write",
  ],
  reviewPolicy: "always_review",
};
const task: Resource = {
  workspaceId: "ws",
  ownerId: "person",
  workerId: "agent",
};

type Case = [string, Actor | null, Action, Resource];

const cases: Case[] = [
  // project:stage
  ["admin moves stage", { ...person, role: "admin" }, "project:stage", task],
  ["lead moves stage", person, "project:stage", { ...task, leadId: "person" }],
  ["other member cannot move stage", person, "project:stage", task],
  [
    "guest lead cannot move stage",
    { ...person, role: "guest" },
    "project:stage",
    { ...task, leadId: "person" },
  ],
  [
    "agent cannot move stage",
    agent,
    "project:stage",
    { ...task, leadId: "agent" },
  ],
  [
    "other workspace denied",
    person,
    "project:stage",
    { workspaceId: "other", leadId: "person" },
  ],
  // workspace:default
  [
    "user selects own default",
    person,
    "workspace:default",
    { userId: "person" },
  ],
  [
    "user cannot change other default",
    person,
    "workspace:default",
    { userId: "other" },
  ],
  [
    "system admin changes other default",
    { ...person, systemAdmin: true },
    "workspace:default",
    { userId: "other" },
  ],
  [
    "agent cannot change default",
    agent,
    "workspace:default",
    { userId: "person" },
  ],
  // workspace:archive
  [
    "admin archives own org",
    { ...person, role: "admin" },
    "workspace:archive",
    task,
  ],
  ["member cannot archive", person, "workspace:archive", task],
  [
    "system admin archives",
    { ...person, systemAdmin: true },
    "workspace:archive",
    task,
  ],
  ["agent cannot archive", agent, "workspace:archive", task],
  // read / create / assign
  ["anonymous cannot read", null, "workspace:read", task],
  ["member can read", person, "workspace:read", task],
  [
    "other workspace read denied",
    person,
    "workspace:read",
    { workspaceId: "other" },
  ],
  ["person can create", person, "task:create", task],
  ["owner can assign", person, "task:assign", task],
  [
    "other member cannot assign",
    person,
    "task:assign",
    { ...task, ownerId: "other" },
  ],
  [
    "admin can assign",
    { ...person, role: "admin" },
    "task:assign",
    { ...task, ownerId: "other" },
  ],
  [
    "admin isolated",
    { ...person, role: "admin" },
    "task:assign",
    { ...task, workspaceId: "other" },
  ],
  // task status
  ["owner moves status", person, "task:status", { ...task, to: "in_progress" }],
  [
    "worker moves status",
    { ...person, id: "worker" },
    "task:status",
    { ...task, workerId: "worker", to: "needs_review" },
  ],
  [
    "bystander cannot move status",
    { ...person, id: "other" },
    "task:status",
    { ...task, to: "in_progress" },
  ],
  // agent scopes / capability:use
  [
    "agent uses tasks.write capability",
    agent,
    "capability:use",
    { ...task, capability: "tasks.write" },
  ],
  [
    "agent denied projects.manage",
    agent,
    "capability:use",
    { ...task, capability: "projects.manage" },
  ],
  [
    "agent missing scope",
    { ...agent, scopes: [] },
    "capability:use",
    { ...task, capability: "tasks.write" },
  ],
  [
    "person capability always uses",
    person,
    "capability:use",
    { ...task, capability: "projects.manage" },
  ],
  // suggestion
  [
    "admin creates suggestion",
    { ...person, role: "admin" },
    "suggestion:create",
    task,
  ],
  [
    "agent creates suggestion on own work",
    agent,
    "suggestion:create",
    { ...task, workerId: "agent" },
  ],
  [
    "agent cannot create suggestion on others work",
    agent,
    "suggestion:create",
    { ...task, workerId: "other" },
  ],
  ["person decides suggestion", person, "suggestion:decide", task],
  // run / task finish
  [
    "agent starts run on own work",
    agent,
    "run:start",
    { ...task, workerId: "agent" },
  ],
  [
    "agent cannot start run on other work",
    agent,
    "run:start",
    { ...task, workerId: "other" },
  ],
  [
    "agent finishes own non-review task ask_only",
    { ...agent, reviewPolicy: "ask_only" },
    "task:finish",
    { ...task, workerId: "agent", requestedReview: false },
  ],
  [
    "agent cannot finish always_review",
    agent,
    "task:finish",
    { ...task, workerId: "agent", requestedReview: false },
  ],
  // token
  [
    "person manages token (admin)",
    { ...person, role: "admin" },
    "token:manage",
    task,
  ],
  ["agent cannot manage token", agent, "token:manage", task],
  ["agent cannot review task", agent, "task:review", task],
  // grant
  [
    "agent requests grant for itself",
    agent,
    "grant:request",
    { ...task, agentId: "agent", capability: "tasks.write" },
  ],
  [
    "agent requests grant for other",
    agent,
    "grant:request",
    { ...task, agentId: "other", capability: "tasks.write" },
  ],
  ["admin decides grant", { ...person, role: "admin" }, "grant:decide", task],
  // crm
  ["person reads contact", person, "contact:read", task],
  [
    "agent reads contact with crm.read allow",
    { ...agent, permissions: [{ capability: "crm.read", decision: "allow" }] },
    "contact:read",
    task,
  ],
  ["agent read contact denied by default ask", agent, "contact:read", task],
  [
    "agent reads contact details with allow",
    {
      ...agent,
      permissions: [
        { capability: "crm.read", decision: "allow" },
        { capability: "crm.contact_details", decision: "allow" },
      ],
    },
    "contact:details",
    task,
  ],
  // finance / mind
  ["person reads finance", person, "finance:read", task],
  [
    "person manages finance admin",
    { ...person, role: "admin" },
    "finance:manage",
    task,
  ],
  ["member cannot manage finance", person, "finance:manage", task],
];

const out = cases.map(([name, actor, action, resource]) => ({
  name,
  result: can(actor, action, resource),
}));

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
