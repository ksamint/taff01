import type { Me } from "@taff/schemas";
import type { QueryClient } from "@tanstack/react-query";

const listeners = new WeakMap<QueryClient, Set<() => void>>();
export function subscribeSession(client: QueryClient, listener: () => void) {
  const subscribers = listeners.get(client) ?? new Set<() => void>();
  listeners.set(client, subscribers);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
export function currentSession(client: QueryClient) {
  return identities.get(client);
}
export function workspaceFingerprint(me: Me) {
  return me.workspaces
    .map((workspace) =>
      [workspace.id, workspace.memberId, workspace.role].join(":"),
    )
    .sort()
    .join(",");
}

const identities = new WeakMap<
  QueryClient,
  { userId: string | null; scope: string; version: number }
>();
export function sessionVersion(client: QueryClient) {
  return identities.get(client)?.version ?? 0;
}
export function sessionMatches(
  client: QueryClient,
  userId: string | null,
  scope = "",
) {
  const identity = identities.get(client);
  return identity?.userId === userId && identity?.scope === scope;
}
export function synchronizeSession(
  client: QueryClient,
  userId: string | null,
  scope = "",
) {
  if (sessionMatches(client, userId, scope)) return;
  // Everything fetched before the first identity of this page used the same
  // cookie as that identity, so only a change of identity, or a sign-out,
  // purges the cache.
  const changed = identities.has(client) || userId === null;
  identities.set(client, {
    userId,
    scope,
    version: sessionVersion(client) + 1,
  });
  if (changed) {
    const protectedQuery = ({ queryKey }: { queryKey: readonly unknown[] }) =>
      queryKey[0] !== "me";
    void client.cancelQueries({ predicate: protectedQuery });
    client.removeQueries({ predicate: protectedQuery });
    // Pending requests can still complete; their captured version guards callbacks.
    client.getMutationCache().clear();
  }
  for (const listener of listeners.get(client) ?? []) listener();
}
