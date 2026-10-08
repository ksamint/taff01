import type { Member, Scope, TaskStatus } from "@taff/schemas";

export type Action =
  | "workspace:read"
  | "task:create"
  | "task:assign"
  | "task:status"
  | "task:schedule"
  | "task:review"
  | "token:manage"
  | "profile:update";
export type Resource =
  | {
      workspaceId: string;
      ownerId?: string;
      workerId?: string | null;
      toWorkerId?: string | null;
      to?: TaskStatus;
    }
  | { userId: string };
/** A member acting through an agent token carries that token's scopes. */
export type Actor = Member & { scopes?: Scope[] };

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
  if (action === "profile:update")
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
  if (actor.kind === "agent") {
    if (action === "token:manage" || action === "task:review") return false;
    const needed =
      action === "task:status" && resource.to === "needs_review"
        ? "inbox:review"
        : SCOPE_FOR[action];
    if (!needed || !actor.scopes?.includes(needed)) return false;
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
    return true;
  }
  const owns = actor.role === "admin" || actor.id === resource.ownerId;
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
      return owns;
    default:
      return false;
  }
}
