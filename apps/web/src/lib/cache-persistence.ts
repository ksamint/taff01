import { type Me, taskListSchema } from "@taff/schemas/base";
import { calendarViewDataSchema } from "@taff/schemas/calendar-read";
import { projectSchema } from "@taff/schemas/project-read";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { registerPublicWorker } from "./pwa";
import {
  currentSession,
  subscribeSession,
  workspaceFingerprint,
} from "./session-cache";

export const cacheDatabaseName = "taff-read-cache";
export const cacheBuster = "m7-read-v1";
const ttl = 24 * 60 * 60 * 1000;
type ReadQuery = { key: QueryKey; data: unknown; updatedAt: number };
export type ReadSnapshot = {
  buster: string;
  userId: string;
  scope: string;
  expiresAt: number;
  queries: ReadQuery[];
};
export type ReadStorage = {
  read: () => Promise<unknown>;
  write: (value: ReadSnapshot, valid: () => boolean) => Promise<void>;
  clear: () => Promise<void>;
};

function indexedDBStorage(): ReadStorage {
  let database: Promise<IDBDatabase> | undefined;
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(cacheDatabaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("cache");
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("cache_blocked"));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    }));
  async function transaction(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, transaction: IDBTransaction) => void,
  ) {
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("cache", mode);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error("cache_aborted"));
      run(tx.objectStore("cache"), tx);
    });
  }
  return {
    async read() {
      let value: unknown;
      await transaction("readonly", (store) => {
        const request = store.get("snapshot");
        request.onsuccess = () => {
          value = request.result;
        };
      });
      return value;
    },
    async write(value, valid) {
      await transaction("readwrite", (store, tx) => {
        if (!valid()) {
          tx.abort();
          return;
        }
        const request = store.put(value, "snapshot");
        // A queued transaction may start after logout or a new mutation.
        request.onsuccess = () => {
          if (!valid()) tx.abort();
        };
      });
    },
    clear: () =>
      transaction("readwrite", (store) => {
        store.clear();
      }),
  };
}

function readData(key: QueryKey, value: unknown, workspaces: Set<string>) {
  if (
    !key.every((part) => typeof part === "string") ||
    !workspaces.has(String(key[1]))
  )
    return undefined;
  if (key[0] === "tasks" && key.length === 2) {
    const parsed = taskListSchema.safeParse(value);
    return parsed.success &&
      parsed.data.every((task) => task.workspaceId === key[1])
      ? parsed.data
      : undefined;
  }
  if (key[0] === "projects" && key.length === 2 && Array.isArray(value)) {
    const parsed = value.map((item) => projectSchema.safeParse(item));
    return parsed.every(
      (item) => item.success && item.data.workspaceId === key[1],
    )
      ? parsed.map((item) => item.data)
      : undefined;
  }
  if (
    key[0] === "calendar" &&
    key.length === 4 &&
    typeof key[2] === "string" &&
    typeof key[3] === "string"
  ) {
    const parsed = calendarViewDataSchema.safeParse(value);
    if (
      !parsed.success ||
      [...parsed.data.occurrences, ...parsed.data.unscheduled].some(
        (item) => item.task.workspaceId !== key[1],
      )
    )
      return undefined;
    return {
      ...parsed.data,
      occurrences: parsed.data.occurrences.map((item) => ({
        ...item,
        canSchedule: false,
      })),
      unscheduled: parsed.data.unscheduled.map((item) => ({
        ...item,
        canSchedule: false,
      })),
    };
  }
  return undefined;
}

/** Read-cache only: auth, permissions, evidence, secrets and writes never persist. */
export function installCachePersistence(
  client: QueryClient,
  storage: ReadStorage = indexedDBStorage(),
) {
  registerPublicWorker();
  let disposed = false;
  let generation = 0;
  let accepted:
    | {
        userId: string;
        scope: string;
        version: number;
        workspaces: Set<string>;
      }
    | undefined;
  let hydrated = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    queue = queue.then(operation).catch(() => {
      /* Storage failures keep the memory cache usable. */
    });
  };
  const valid = (version: number, scope: string, identityGeneration: number) =>
    !disposed &&
    generation === identityGeneration &&
    accepted?.scope === scope &&
    currentSession(client)?.confirmed !== false &&
    currentSession(client)?.version === version &&
    client.isMutating() === 0;
  const persist = () => {
    if (!accepted || !hydrated || disposed || client.isMutating()) return;
    const identity = accepted;
    const identityGeneration = generation;
    const cached = client.getQueryCache().findAll();
    // Keep the previous durable snapshot while a read is reconciling or failed.
    if (
      cached.some(
        (query) =>
          ["tasks", "projects", "calendar"].includes(
            String(query.queryKey[0]),
          ) &&
          identity.workspaces.has(String(query.queryKey[1])) &&
          (query.state.fetchStatus !== "idle" ||
            query.state.status === "error"),
      )
    )
      return;
    const queries = cached
      .filter(
        (query) =>
          query.state.status === "success" &&
          query.state.fetchStatus === "idle",
      )
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
      .flatMap((query) => {
        const data = readData(
          query.queryKey,
          query.state.data,
          identity.workspaces,
        );
        return data === undefined
          ? []
          : [
              {
                key: query.queryKey,
                data,
                updatedAt: query.state.dataUpdatedAt,
              },
            ];
      })
      .slice(0, 30);
    const snapshot: ReadSnapshot = {
      buster: cacheBuster,
      userId: identity.userId,
      scope: identity.scope,
      expiresAt: Date.now() + ttl,
      queries,
    };
    if (JSON.stringify(snapshot).length > 2_000_000) return;
    enqueue(async () => {
      if (valid(identity.version, identity.scope, identityGeneration))
        await storage.write(snapshot, () =>
          valid(identity.version, identity.scope, identityGeneration),
        );
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!accepted || !hydrated || disposed) return;
    timer = setTimeout(persist, 100);
  };
  const sessionChanged = () => {
    const session = currentSession(client);
    if (!session || !session.confirmed || disposed) return;
    generation++;
    clearTimeout(timer);
    hydrated = false;
    const previous = accepted;
    accepted = undefined;
    if (!session.userId) {
      enqueue(storage.clear);
      return;
    }
    const me = client.getQueryData<Me | null>(["me"]);
    const state = client.getQueryState(["me"]);
    if (
      !me ||
      state?.status !== "success" ||
      state.fetchStatus !== "idle" ||
      me.user.id !== session.userId ||
      workspaceFingerprint(me) !== session.scope
    )
      return;
    accepted = {
      ...session,
      userId: session.userId,
      workspaces: new Set(me.workspaces.map((workspace) => workspace.id)),
    };
    const identity = accepted;
    const identityGeneration = generation;
    enqueue(async () => {
      const saved =
        previous && previous.scope !== identity.scope
          ? undefined
          : await storage.read();
      if (!valid(identity.version, identity.scope, identityGeneration)) return;
      if (
        saved &&
        typeof saved === "object" &&
        "buster" in saved &&
        saved.buster === cacheBuster &&
        "userId" in saved &&
        saved.userId === identity.userId &&
        "scope" in saved &&
        saved.scope === identity.scope &&
        "expiresAt" in saved &&
        typeof saved.expiresAt === "number" &&
        saved.expiresAt > Date.now() &&
        "queries" in saved &&
        Array.isArray(saved.queries)
      ) {
        for (const item of saved.queries.slice(0, 30)) {
          if (
            !item ||
            typeof item !== "object" ||
            !Array.isArray(item.key) ||
            typeof item.updatedAt !== "number"
          )
            continue;
          const data = readData(item.key, item.data, identity.workspaces);
          if (
            data === undefined ||
            // Authenticated server/live reads outrank a durable cache, even
            // when an old device clock gave the snapshot a future timestamp.
            client.getQueryData(item.key) !== undefined ||
            (client.getQueryState(item.key)?.dataUpdatedAt ?? 0) >=
              item.updatedAt
          )
            continue;
          client.setQueryData(item.key, data, { updatedAt: item.updatedAt });
          // Persisted data always reconciles, even within the normal stale time.
          void client.invalidateQueries(
            { queryKey: item.key, exact: true },
            { cancelRefetch: false },
          );
        }
      } else await storage.clear();
      if (!valid(identity.version, identity.scope, identityGeneration)) return;
      hydrated = true;
      schedule();
    });
  };
  const unsubscribeSession = subscribeSession(client, sessionChanged);
  const unsubscribeQueries = client.getQueryCache().subscribe((event) => {
    if (
      !accepted &&
      event.query.queryKey[0] === "me" &&
      event.query.state.fetchStatus === "idle"
    )
      sessionChanged();
    else schedule();
  });
  const unsubscribeMutations = client.getMutationCache().subscribe(() => {
    if (accepted && !hydrated && client.isMutating() === 0) sessionChanged();
    else schedule();
  });
  sessionChanged();
  return () => {
    disposed = true;
    generation++;
    clearTimeout(timer);
    unsubscribeSession();
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
