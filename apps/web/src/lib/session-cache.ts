import type { QueryClient } from "@tanstack/react-query";

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
  identities.set(client, {
    userId,
    scope,
    version: sessionVersion(client) + 1,
  });
  const protectedQuery = ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] !== "me";
  void client.cancelQueries({ predicate: protectedQuery });
  client.removeQueries({ predicate: protectedQuery });
  // Pending requests can still complete; their captured version guards callbacks.
  client.getMutationCache().clear();
}
