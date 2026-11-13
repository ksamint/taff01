// Emits a golden table of `can(actor, action, resource)` decisions for the
// cases the Rust permissions port must match. Part of `pnpm rust:fixtures`;
// The local gate regenerates and diffs the output.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Action,
  type Actor,
  can,
  canGrantOAuthScopes,
  PERMISSION_ACTIONS,
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
  [
    "view agent both",
    { ...agent, scopes: ["tasks:read", "summaries:read"] },
    "view:export",
    { workspaceId: "ws" },
  ],
  [
    "view agent missing tasks",
    { ...agent, scopes: ["summaries:read"] },
    "view:export",
    { workspaceId: "ws" },
  ],
  [
    "view agent missing summaries",
    { ...agent, scopes: ["tasks:read"] },
    "view:export",
    { workspaceId: "ws" },
  ],
  [
    "view agent foreign",
    { ...agent, scopes: ["tasks:read", "summaries:read"] },
    "view:export",
    { workspaceId: "foreign" },
  ],
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

const now = Date.parse("2026-11-06T00:00:00.000Z");
const originalNow = Date.now;
Date.now = () => now;
const allScopes = [
  "tasks:read",
  "tasks:write",
  "calendar:write",
  "inbox:review",
  "files:write",
  "summaries:read",
] as const;
const actors: [string, Actor | null][] = [
  ["admin", { ...person, role: "admin" }],
  ["member", person],
  ["guest", { ...person, role: "guest" }],
  ["agent", { ...agent, scopes: [...allScopes] }],
  ["system administrator", { ...person, systemAdmin: true }],
  ["outsider", { ...person, workspaceId: "other" }],
  ["anonymous", null],
];
for (const action of PERMISSION_ACTIONS)
  for (const [role, actor] of actors) {
    cases.push([
      `${role}: ${action}`,
      actor,
      action,
      { ...task, userId: "person" },
    ]);
  }
for (const capability of [
  "tasks.read",
  "tasks.write",
  "projects.manage",
  "web.search",
  "files.attach",
  "crm.read",
] as const) {
  for (const expiresAt of [
    null,
    new Date(now - 1).toISOString(),
    new Date(now).toISOString(),
    new Date(now + 1).toISOString(),
  ]) {
    cases.push([
      `${capability} ask expiry ${expiresAt}`,
      {
        ...agent,
        permissions: [{ capability, decision: "ask" }],
        grants: [
          {
            capability,
            taskId: "task",
            runId: null,
            status: "allowed",
            expiresAt,
          },
        ],
      },
      "capability:use",
      { workspaceId: "ws", capability, taskId: "task" },
    ]);
  }
}
for (const scopes of [[], ["summaries:read"]] as const)
  cases.push([
    `agent summary scope ${scopes.join()}`,
    { ...agent, scopes: [...scopes] },
    "summary:read",
    task,
  ]);
cases.push([
  "linked guest summary",
  { ...person, role: "guest" },
  "summary:read",
  { workspaceId: "ws", recipientUserId: "person" },
]);

for (const workerId of [undefined, null, "agent", "other"])
  for (const toWorkerId of [undefined, null, "agent", "other", ""])
    for (const action of ["task:assign", "task:create"] as const)
      cases.push([
        `agent ${action} worker=${workerId} target=${toWorkerId}`,
        agent,
        action,
        { workspaceId: "ws", workerId, toWorkerId },
      ]);
cases.push([
  "omitted review policy never authorizes task finish",
  { ...agent, reviewPolicy: undefined },
  "task:finish",
  { ...task, requestedReview: false },
]);
for (const grantTask of [null, "task", "other"])
  for (const grantRun of [null, "run", "other"])
    for (const status of ["allowed", "pending", "revoked"] as const)
      cases.push([
        `ask task=${grantTask} run=${grantRun} status=${status}`,
        {
          ...agent,
          permissions: [{ capability: "tasks.write", decision: "ask" }],
          grants: [
            {
              capability: "tasks.write",
              taskId: grantTask,
              runId: grantRun,
              status,
              expiresAt: new Date(now + 1).toISOString(),
            },
          ],
        },
        "capability:use",
        {
          workspaceId: "ws",
          capability: "tasks.write",
          taskId: "task",
          runId: "run",
        },
      ]);
for (const approvedProjectOperation of [false, true])
  for (const decision of ["allow", "ask", "deny"] as const)
    cases.push([
      `agent projects approved=${approvedProjectOperation} decision=${decision}`,
      { ...agent, permissions: [{ capability: "projects.manage", decision }] },
      "project:manage",
      { ...task, approvedProjectOperation },
    ]);
assert(
  PERMISSION_ACTIONS.every((action) =>
    cases.some(([, , candidate]) => candidate === action),
  ),
);
const out: Record<string, unknown>[] = cases.map(
  ([name, actor, action, resource]) => ({
    name,
    now,
    actor: actor && {
      ...actor,
      permissions: actor.permissions?.map((p) => [p.capability, p.decision]),
      grants: actor.grants?.map((g) => ({
        ...g,
        status: g.status === "allowed" ? "allowed" : "other",
        expiresAtMs: g.expiresAt ? Date.parse(g.expiresAt) : null,
      })),
    },
    action,
    resource,
    result: can(actor, action, resource),
  }),
);
for (const [role, actor] of actors)
  for (const scopes of [
    [],
    ["tasks:read"],
    ["files:write"],
    ["summaries:read"],
    [...allScopes],
  ] as Actor["scopes"][]) {
    const resource = { workspaceId: "ws", supervisorId: actor?.id };
    out.push({
      name: `OAuth ${role} scopes=${scopes?.join()}`,
      now,
      actor: actor && { ...actor, permissions: undefined, grants: undefined },
      resource,
      oauthScopes: scopes,
      result: canGrantOAuthScopes(actor, resource, scopes ?? []),
    });
  }
Date.now = originalNow;

const target = fileURLToPath(
  new URL(
    "../../../backend/crates/taff-core/tests/fixtures/permissions-golden.json",
    import.meta.url,
  ),
);
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${out.length} permission decisions -> ${target}`);
