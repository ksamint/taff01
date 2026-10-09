import {
  dailyDigestListSchema,
  dailyDigestSchema,
  notificationPreferencesSchema,
  type UpdateNotificationPreferences,
  updateNotificationPreferencesSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { invalidateM3 } from "./m3-queries";
import { m3MutationKey } from "./optimistic-m3";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "./query-snapshot";

export const notificationPreferencesKey = ["notificationPreferences"] as const;
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationPreferencesKey,
    staleTime: 0,
    queryFn: async () =>
      notificationPreferencesSchema.parse(
        await request("/api/me/notifications"),
      ),
  });
}
export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: UpdateNotificationPreferences) =>
      notificationPreferencesSchema.parse(
        await request("/api/me/notifications", {
          method: "PATCH",
          body: JSON.stringify(updateNotificationPreferencesSchema.parse(body)),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = await snapshotQueries(client, [
        notificationPreferencesKey,
      ]);
      client.setQueryData(notificationPreferencesKey, {
        ...body,
        version: body.version + 1,
      });
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (value, _, snapshot) => {
      if (isCurrentSnapshot(client, snapshot))
        client.setQueryData(notificationPreferencesKey, value);
    },
    onSettled: () => invalidateM3(client),
  });
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
export function deviceAlertsKey(userId: string) {
  return `taff-device-alerts:${userId}`;
}
const devices = new Map<string, boolean>();
export function deviceAlertsEnabled(userId: string) {
  if (devices.has(userId)) return devices.get(userId)!;
  try {
    return localStorage.getItem(deviceAlertsKey(userId)) === "true";
  } catch {
    return false;
  }
}
export function setDeviceAlertsEnabled(userId: string, enabled: boolean) {
  devices.set(userId, enabled);
  try {
    if (enabled) localStorage.setItem(deviceAlertsKey(userId), "true");
    else localStorage.removeItem(deviceAlertsKey(userId));
  } catch {
    /* The active page still remembers the explicit choice. */
  }
}
