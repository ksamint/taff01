import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { ApiError } from "./api";
import { currentSession, sessionVersion } from "./session-cache";

// Cancel reads before taking the rollback snapshot, using TanStack's own cache.
export async function snapshotQueries(
  client: QueryClient,
  keys: readonly QueryKey[],
) {
  if (currentSession(client)?.confirmed === false)
    throw new ApiError("unauthorized", 401);
  const version = sessionVersion(client);
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
  if (version !== sessionVersion(client))
    throw new ApiError("unauthorized", 401);
  return Object.assign(
    keys.map((key) => [key, client.getQueryData(key)] as const),
    { version },
  );
}

export function isCurrentSnapshot(
  client: QueryClient,
  snapshot: Awaited<ReturnType<typeof snapshotQueries>> | undefined,
) {
  return !!snapshot && snapshot.version === sessionVersion(client);
}

export function restoreQueries(
  client: QueryClient,
  snapshot: Awaited<ReturnType<typeof snapshotQueries>> | undefined,
) {
  if (!isCurrentSnapshot(client, snapshot)) return;
  for (const [queryKey, data] of snapshot ?? []) {
    if (data === undefined) client.removeQueries({ queryKey, exact: true });
    else client.setQueryData(queryKey, data);
  }
}
