import type {
  Capability,
  Grant,
  Member,
  PermissionDecision,
  ReviewPolicy,
  Scope,
  TaskStatus,
} from "@taff/schemas";

export type Action =
  | "workspace:create"
  | "workspace:join"
  | "workspace:manage"
  | "project:manage"
  | "task:edit"
  | "task:owner"
  | "task:comment"
  | "workspace:read"
  | "task:create"
  | "task:assign"
  | "task:status"
  | "task:schedule"
  | "task:review"
  | "token:manage"
  | "profile:update"
  | "notification:read"
  | "notification:update"
  | "digest:read"
  | "run:start"
  | "run:control"
  | "run:submit"
  | "run:request_review"
  | "files:attach"
  | "agent:manage"
  | "grant:request"
  | "grant:decide"
  | "inbox:read"
  | "inbox:update"
  | "capability:use"
  | "review:comment"
  | "task:finish";
export type Resource =
  | {
      workspaceId: string;
      ownerId?: string;
      workerId?: string | null;
      toWorkerId?: string | null;
      to?: TaskStatus;
      taskId?: string;
      runId?: string;
      agentId?: string;
      supervisorId?: string | null;
      memberId?: string;
      capability?: Capability;
      requestedReview?: boolean;
    }
  | { userId: string };
/** A member acting through an agent token carries that token's scopes. */
export type Actor = Member & {
  scopes?: Scope[];
  permissions?: { capability: Capability; decision: PermissionDecision }[];
  grants?: Pick<
    Grant,
    "capability" | "taskId" | "runId" | "status" | "expiresAt"
  >[];
  reviewPolicy?: ReviewPolicy;
};

const SCOPE_FOR: Partial<Record<Action, Scope>> = {
  "workspace:read": "tasks:read",
  "task:create": "tasks:write",
  "task:assign": "tasks:write",
  "task:status": "tasks:write",
  "task:schedule": "calendar:write",
};
/** Statuses an agent may set on its own. Approval is a person's act. */
const AGENT_STATUSES: TaskStatus[] = ["in_progress", "needs_review"];

export function can(
  actor: Actor | null,
  action: Action,
  resource: Resource,
): boolean {
  if (!actor) return false;
  if (
    action === "notification:read" ||
    action === "notification:update" ||
    action === "profile:update" ||
    action === "workspace:create" ||
    action === "workspace:join"
  )
    return (
      "userId" in resource &&
      actor.kind === "person" &&
      actor.userId === resource.userId
    );
  if (
    !("workspaceId" in resource) ||
    actor.workspaceId !== resource.workspaceId
  )
    return false;
  if (
    actor.role === "guest" &&
    !["workspace:read", "inbox:read", "inbox:update", "digest:read"].includes(
      action,
    )
  )
    return false;
  if (action === "workspace:manage" || action === "project:manage")
    return actor.kind === "person" && actor.role === "admin";
  const owns = actor.role === "admin" || actor.id === resource.ownerId;
  if (["task:edit", "task:owner", "task:comment"].includes(action)) {
    if (actor.kind === "person") return action === "task:comment" || owns;
    return (
      action !== "task:owner" &&
      actor.id === resource.workerId &&
      can(actor, "capability:use", { ...resource, capability: "tasks.write" })
    );
  }
  if (action === "agent:manage")
    return actor.kind === "person" && actor.role === "admin";
  if (action === "grant:decide")
    return (
      actor.kind === "person" &&
      (actor.role === "admin" || actor.id === resource.supervisorId)
    );
  if (action === "grant:request")
    return actor.kind === "agent"
      ? actor.id === resource.agentId &&
          !!actor.scopes?.includes(
            capabilityScope(resource.capability ?? "tasks.write"),
          )
      : owns;
  if (
    action === "inbox:read" ||
    action === "inbox:update" ||
    action === "digest:read"
  )
    return (
      actor.kind === "person" &&
      (resource.memberId === undefined || resource.memberId === actor.id)
    );
  if (action === "capability:use") {
    if (actor.kind === "person") return true;
    const capability = resource.capability;
    if (!capability) return false;
    const scope = capabilityScope(capability);
    if (!actor.scopes?.includes(scope)) return false;
    const decision =
      actor.permissions?.find(
        (permission) => permission.capability === capability,
      )?.decision ?? DEFAULT_PERMISSIONS[capability];
    if (decision === "deny") return false;
    if (decision === "allow") return true;
    return !!actor.grants?.some(
      (grant) =>
        grant.capability === capability &&
        grant.status === "allowed" &&
        grant.expiresAt &&
        Date.parse(grant.expiresAt) > Date.now() &&
        (!grant.taskId || grant.taskId === resource.taskId) &&
        (!grant.runId || grant.runId === resource.runId),
    );
  }
  if (
    [
      "run:start",
      "run:control",
      "run:submit",
      "run:request_review",
      "files:attach",
      "review:comment",
      "task:finish",
    ].includes(action)
  ) {
    if (actor.kind === "agent") {
      if (actor.id !== resource.workerId) return false;
      if (
        !can(actor, "capability:use", {
          ...resource,
          capability:
            action === "files:attach" ? "files.attach" : "tasks.write",
        })
      )
        return false;
      if (action === "task:finish")
        return (
          actor.reviewPolicy === "ask_only" &&
          resource.requestedReview === false
        );
      if (action === "run:request_review")
        return !!actor.scopes?.includes("inbox:review");
      return true;
    }
    return action === "review:comment" || owns;
  }
  if (actor.kind === "agent") {
    if (action === "token:manage" || action === "task:review") return false;
    const needed =
      action === "task:status" && resource.to === "needs_review"
        ? "inbox:review"
        : SCOPE_FOR[action];
    if (!needed || !actor.scopes?.includes(needed)) return false;
    const capability: Capability =
      action === "workspace:read"
        ? "tasks.read"
        : action === "task:schedule"
          ? "calendar.schedule"
          : "tasks.write";
    if (!can(actor, "capability:use", { ...resource, capability }))
      return false;
    if (action === "task:status")
      return (
        !!resource.to &&
        AGENT_STATUSES.includes(resource.to) &&
        resource.workerId === actor.id
      );
    if (action === "task:schedule") return resource.workerId === actor.id;
    if (action === "task:assign")
      // An agent may take an unassigned task or release its own, never
      // hand work to someone else or take it from another worker.
      return resource.workerId === actor.id
        ? resource.toWorkerId === null || resource.toWorkerId === actor.id
        : resource.workerId == null && resource.toWorkerId === actor.id;
    if (action === "task:create")
      // A task an agent creates is its own work or unassigned, never someone else's.
      return !resource.toWorkerId || resource.toWorkerId === actor.id;
    return true;
  }
  switch (action) {
    case "workspace:read":
    case "task:create":
      return true;
    case "token:manage":
      return actor.role === "admin";
    case "task:assign":
    case "task:schedule":
      return owns;
    case "task:status":
      // Only a reviewer closes work that waits for review (task:review).
      return (
        !!resource.to &&
        (owns || actor.id === resource.workerId) &&
        resource.to !== "done"
      );
    case "task:review":
      return owns || actor.id === resource.supervisorId;
    default:
      return false;
  }
}

export const DEFAULT_PERMISSIONS: Record<Capability, PermissionDecision> = {
  "tasks.read": "allow",
  "tasks.write": "allow",
  "files.attach": "allow",
  "calendar.schedule": "allow",
  "web.search": "ask",
  "repo.read": "ask",
  "repo.pr": "ask",
  "repo.merge": "deny",
  "deploy.prod": "deny",
  "staging.read": "ask",
  "staging.write": "ask",
  alerts: "ask",
};

function capabilityScope(capability: Capability): Scope {
  return capability === "tasks.read"
    ? "tasks:read"
    : capability === "calendar.schedule"
      ? "calendar:write"
      : capability === "files.attach"
        ? "files:write"
        : "tasks:write";
}
