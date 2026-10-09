import { notificationPreferencesSchema } from "@taff/schemas/notification-preferences";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

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
