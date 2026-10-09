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
import { notificationPreferencesKey } from "./notification-preferences";
import { m3MutationKey } from "./optimistic-m3";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "./query-snapshot";

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

export {
  deviceAlertsEnabled,
  deviceAlertsKey,
  notificationPreferencesKey,
  setDeviceAlertsEnabled,
  useNotificationPreferences,
} from "./notification-preferences";
