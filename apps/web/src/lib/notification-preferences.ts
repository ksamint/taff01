import {
  type NotificationPreferences,
  notificationPreferencesSchema,
} from "@taff/schemas/notification-preferences";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const notificationPreferencesKey = ["notificationPreferences"] as const;
/** A late read must not replace a pending choice or a newer saved version. */
export async function readNotificationPreferences(
  client: QueryClient,
  read: () => Promise<NotificationPreferences>,
) {
  const incoming = await read();
  const current = client.getQueryData<NotificationPreferences>(
    notificationPreferencesKey,
  );
  // Equal versions can differ only because this tab has an optimistic draft.
  // Other tabs' real edits increment the version and still reconcile normally.
  return current && current.version >= incoming.version ? current : incoming;
}
export function useNotificationPreferences() {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    queryKey: notificationPreferencesKey,
    staleTime: 0,
    queryFn: () =>
      readNotificationPreferences(client, async () =>
        notificationPreferencesSchema.parse(
          await request("/api/me/notifications"),
        ),
      ),
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
