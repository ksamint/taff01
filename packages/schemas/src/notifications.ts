import { calendarCivilTime } from "./calendar";
import type { NotificationPreferences } from "./index";
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  version: 1,
  review: true,
  block: true,
  mention: true,
  done: true,
  digest: true,
  digestAt: "09:00",
  quiet: false,
};
/** Foreground delivery policy only. Durable Inbox items are never suppressed. */
export function shouldShowForegroundNotification(
  preferences: NotificationPreferences,
  kind: "review" | "blocker" | "mention" | "done" | "digest",
  instant: string,
  timeZone: string,
): boolean {
  const enabled = kind === "blocker" ? preferences.block : preferences[kind];
  if (!enabled) return false;
  if (kind === "blocker" || !preferences.quiet) return true;
  const hour = calendarCivilTime(instant, timeZone).getUTCHours();
  return hour >= 8 && hour < 22;
}
