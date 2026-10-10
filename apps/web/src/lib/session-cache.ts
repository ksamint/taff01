import type { Me } from "@taff/schemas";
import type { TodayBootstrap } from "@taff/schemas/today-bootstrap";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { calendarKey, membersKey, runsKey, tasksKey } from "./query-keys";

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
  { userId: string | null; scope: string; version: number; confirmed: boolean }
>();
const serverReads = new WeakMap<QueryClient, Set<string>>();
export function bootstrapSession(
  client: QueryClient,
  me: Me | null,
  today?: TodayBootstrap["today"],
) {
  if (identities.has(client)) throw new Error("Session already initialized");
  identities.set(client, {
    userId: me?.user.id ?? null,
    scope: me ? workspaceFingerprint(me) : "",
    version: 1,
    confirmed: false,
  });
  if (!today || !me?.workspaces.some(({ id }) => id === today.workspaceId))
    return;
  const reads: { key: QueryKey; data: unknown }[] = [
    { key: tasksKey(today.workspaceId), data: today.tasks },
    { key: membersKey(today.workspaceId), data: today.members },
    { key: runsKey(today.workspaceId), data: today.runs },
    {
      key: calendarKey(today.workspaceId, today.from, today.to),
      data: today.calendar,
    },
  ];
  serverReads.set(client, new Set(reads.map(({ key }) => JSON.stringify(key))));
  for (const { key, data } of reads)
    client.setQueryData(key, data, { updatedAt: today.now });
}
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
  if (
    sessionMatches(client, userId, scope) &&
    identities.get(client)?.confirmed
  )
    return;
  // Only the authenticated server's exact read keys survive matching browser
  // confirmation. Browser/durable provisional data never gets this privilege.
  const retained = sessionMatches(client, userId, scope)
    ? serverReads.get(client)
    : undefined;
  const changed = identities.has(client) || userId === null;
  identities.set(client, {
    userId,
    scope,
    version: sessionVersion(client) + 1,
    confirmed: true,
  });
  if (changed) {
    const protectedQuery = ({ queryKey }: { queryKey: QueryKey }) =>
      queryKey[0] !== "me" && !retained?.has(JSON.stringify(queryKey));
    void client.cancelQueries({ predicate: protectedQuery });
    client.removeQueries({ predicate: protectedQuery });
    // Pending requests can still complete; their captured version guards callbacks.
    client.getMutationCache().clear();
    if (retained)
      void client.invalidateQueries({
        predicate: ({ queryKey }) => retained.has(JSON.stringify(queryKey)),
        refetchType: "none",
      });
  }
  serverReads.delete(client);
  for (const listener of listeners.get(client) ?? []) listener();
}
