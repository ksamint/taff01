import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { ApiError } from "./api";
import { currentSession, sessionVersion } from "./session-cache";

type Entry = [QueryKey, unknown];
type Snapshot = Entry[] & {
  version: number;
  after?: Entry[];
  capture: () => Snapshot;
  start: () => Snapshot;
};
// Weak references keep successful mutations from retaining cached session data.
const snapshots = new WeakMap<QueryClient, Set<WeakRef<Snapshot>>>();

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);
const rows = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((row) => record(row) && "id" in row);

/** Invert only changed fields still carrying this mutation's value. */
function inverse(before: unknown, after: unknown, current: unknown): unknown {
  if (equal(before, after)) return current;
  if (equal(current, after)) return before;
  if (rows(before) && rows(after) && rows(current)) {
    const old = new Map(before.map((row) => [row.id, row]));
    const next = new Map(after.map((row) => [row.id, row]));
    const result = current.flatMap((row) => {
      if (!old.has(row.id) && next.has(row.id)) return [];
      return [
        inverse(old.get(row.id), next.get(row.id), row) as Record<
          string,
          unknown
        >,
      ];
    });
    for (const [index, row] of before.entries()) {
      if (!next.has(row.id) && !result.some((item) => item.id === row.id))
        result.splice(Math.min(index, result.length), 0, row);
    }
    return result;
  }
  if (record(before) && record(after) && record(current)) {
    const result = { ...current };
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (equal(before[key], after[key])) continue;
      const value = inverse(before[key], after[key], current[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  return current;
}

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
  const entries: Entry[] = [
    ...new Map(keys.map((key) => [hashKey(key), key])).values(),
  ].map((key) => [key, client.getQueryData(key)]);
  const snapshot: Snapshot = Object.assign(entries, {
    version,
    start: () => {
      if (version !== sessionVersion(client))
        throw new ApiError("unauthorized", 401);
      // Multiple cancellations can resolve together. Read the baseline at the
      // actual start of this synchronous optimistic edit, after all awaits.
      for (const entry of snapshot) entry[1] = client.getQueryData(entry[0]);
      return snapshot;
    },
    capture: () => {
      // Call at the end of onMutate, before another mutation can patch the cache.
      snapshot.after ??= snapshot.map(([key]) => [
        key,
        client.getQueryData(key),
      ]);
      return snapshot;
    },
  });
  const pending = snapshots.get(client) ?? new Set<WeakRef<Snapshot>>();
  for (const ref of pending) {
    const other = ref.deref();
    if (!other || other.version !== version) pending.delete(ref);
  }
  pending.add(new WeakRef(snapshot));
  snapshots.set(client, pending);
  return snapshot;
}

export function isCurrentSnapshot(
  client: QueryClient,
  snapshot: Snapshot | undefined,
) {
  return !!snapshot && snapshot.version === sessionVersion(client);
}

export function restoreQueries(
  client: QueryClient,
  snapshot: Snapshot | undefined,
) {
  if (!snapshot || !isCurrentSnapshot(client, snapshot)) return;
  // Direct helper callers may capture immediately before restoring. Mutation
  // callbacks always capture before returning from onMutate.
  snapshot.capture();
  const changes = snapshot.map(([key, before], index) => ({
    key,
    before,
    after: snapshot.after![index][1],
    hash: hashKey(key),
  }));
  for (const { key, before, after } of changes) {
    const data = inverse(before, after, client.getQueryData(key));
    if (data === undefined)
      client.removeQueries({ queryKey: key, exact: true });
    else client.setQueryData(key, data);
  }
  // Remove the failed layer from later snapshots too, so a later failure cannot
  // resurrect it (including two writes to the same field failing in either order).
  const pending = snapshots.get(client);
  let later = false;
  for (const ref of pending ?? []) {
    const other = ref.deref();
    if (!other || other === snapshot || other.version !== snapshot.version) {
      pending?.delete(ref);
      if (other === snapshot) later = true;
      continue;
    }
    if (!later) continue;
    for (const entries of [other, other.after ?? []])
      for (const entry of entries) {
        const change = changes.find((item) => item.hash === hashKey(entry[0]));
        if (change) entry[1] = inverse(change.before, change.after, entry[1]);
      }
  }
}
