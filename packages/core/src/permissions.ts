import type { Member } from "@taff/schemas";
export type Action =
  | "workspace:read"
  | "task:create"
  | "task:assign"
  | "profile:update";
export type Resource =
  | { workspaceId: string; ownerId?: string }
  | { userId: string };
export function can(
  actor: Member | null,
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
  if (action === "workspace:read" || action === "task:create") return true;
  return (
    action === "task:assign" &&
    (actor.role === "admin" || actor.id === resource.ownerId)
  );
}
