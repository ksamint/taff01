// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  boolean,
  type infer as Infer,
  strictObject,
  enum as zodEnum,
} from "zod/mini";
import { versionSchema } from "./primitives";
export const notificationPreferencesSchema = strictObject({
  version: versionSchema,
  review: boolean(),
  block: boolean(),
  mention: boolean(),
  done: boolean(),
  digest: boolean(),
  digestAt: zodEnum(["08:00", "09:00", "18:00"]),
  quiet: boolean(),
});
export const updateNotificationPreferencesSchema =
  notificationPreferencesSchema;
export type NotificationPreferences = Infer<
  typeof notificationPreferencesSchema
>;
export type UpdateNotificationPreferences = Infer<
  typeof updateNotificationPreferencesSchema
>;
export {
  DEFAULT_NOTIFICATION_PREFERENCES,
  shouldShowForegroundNotification,
} from "./notifications";
