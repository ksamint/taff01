import {
  dailyDigestListSchema,
  dailyDigestSchema,
  type NotificationPreferences,
  notificationPreferencesSchema,
  type UpdateNotificationPreferences,
  updateNotificationPreferencesSchema,
} from "@taff/schemas";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "./api";
import { invalidateM3 } from "./m3-queries";
import { notificationPreferencesKey } from "./notification-preferences";
import { m3MutationKey } from "./optimistic-m3";
import { snapshotQueries } from "./query-snapshot";
import { sessionVersion } from "./session-cache";

/**
 * Saves a whole settings document one request at a time. A value written while
 * a save is in flight replaces any earlier queued one and is sent next, with the
 * version that save returned, so a quick second choice is neither dropped nor
 * rejected as stale (M14 checklist: the digest radio needed a retry).
 */
export function createLatestWriter<T extends { version: number }>(handlers: {
  send: (body: T) => Promise<T>;
  /** After each save. `next` is the newer value about to be sent, if any. */
  saved: (value: T, next: T | undefined) => void;
  /** The save failed; any queued value is dropped with it. */
  failed: (error: unknown) => void;
}) {
  let queued: T | undefined;
  let running = false;
  async function run(first: T) {
    running = true;
    try {
      let body: T | undefined = first;
      while (body) {
        const value = await handlers.send(body);
        body = queued && { ...queued, version: value.version };
        queued = undefined;
        handlers.saved(value, body);
      }
    } catch (error) {
      queued = undefined;
      handlers.failed(error);
    } finally {
      running = false;
    }
  }
  return {
    get busy() {
      return running;
    },
    write(body: T) {
      if (running) queued = body;
      else void run(body);
    },
  };
}

type PreferenceWriter = {
  writer: ReturnType<typeof createLatestWriter<NotificationPreferences>>;
  send?: (
    body: UpdateNotificationPreferences,
  ) => Promise<NotificationPreferences>;
  /** The last server-confirmed value and the session it belongs to. */
  confirmed?: { value: NotificationPreferences; session: number };
};
const preferenceWriters = new WeakMap<QueryClient, PreferenceWriter>();
function preferenceWriter(client: QueryClient) {
  const existing = preferenceWriters.get(client);
  if (existing) return existing;
  const state: PreferenceWriter = {
    writer: createLatestWriter<NotificationPreferences>({
      send: (body) => {
        if (!state.send) throw new Error("Preference writer is not mounted");
        return state.send(body);
      },
      saved: (value, next) => {
        if (state.confirmed?.session !== sessionVersion(client)) return;
        state.confirmed = { ...state.confirmed, value };
        // Keep showing the newer choice while it is being sent.
        client.setQueryData(notificationPreferencesKey, next ?? value);
        if (!next) void invalidateM3(client);
      },
      failed: () => {
        if (state.confirmed?.session === sessionVersion(client))
          client.setQueryData(
            notificationPreferencesKey,
            state.confirmed.value,
          );
        void invalidateM3(client);
      },
    }),
  };
  preferenceWriters.set(client, state);
  return state;
}

/**
 * Notification preferences change optimistically and stay editable while a
 * save is in flight: writes are serialized latest-wins (createLatestWriter),
 * and a failure restores the last confirmed value and surfaces `error`.
 */
export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: UpdateNotificationPreferences) =>
      notificationPreferencesSchema.parse(
        await request("/api/me/notifications", {
          method: "PATCH",
          body: JSON.stringify(updateNotificationPreferencesSchema.parse(body)),
        }),
      ),
  });
  const state = preferenceWriter(client);
  // The latest mounted control reports the outcome of the next save.
  state.send = mutation.mutateAsync;
  return {
    error: mutation.error,
    async change(patch: Partial<NotificationPreferences>) {
      let snapshot: Awaited<ReturnType<typeof snapshotQueries>>;
      try {
        snapshot = await snapshotQueries(client, [notificationPreferencesKey]);
      } catch {
        return; // Signed out: there is nothing to save.
      }
      const current = client.getQueryData<NotificationPreferences>(
        notificationPreferencesKey,
      );
      if (!current) return;
      if (!state.writer.busy)
        state.confirmed = { value: current, session: snapshot.version };
      const next = { ...current, ...patch };
      client.setQueryData(notificationPreferencesKey, next);
      state.writer.write(next);
    },
  };
}
export function useDailyDigests(workspaceId: string) {
  return useQuery({
    queryKey: ["dailyDigests", workspaceId],
    staleTime: 0,
    queryFn: async () =>
      dailyDigestListSchema.parse(
        await request(`/api/digests?workspaceId=${workspaceId}`),
      ),
  });
}
export function useDailyDigest(id: string) {
  return useQuery({
    queryKey: ["dailyDigest", id],
    staleTime: 0,
    queryFn: async () =>
      dailyDigestSchema.parse(await request(`/api/digests/${id}`)),
  });
}

export {
  deviceAlertsEnabled,
  deviceAlertsKey,
  notificationPreferencesKey,
  setDeviceAlertsEnabled,
  useNotificationPreferences,
} from "./notification-preferences";
