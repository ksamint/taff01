import {
  type NotificationPreferences,
  notificationPreferencesSchema,
} from "../../packages/schemas/src/notification-preferences";

/** Versions advance during restoration; only these seven fields are the goal. */
export function notificationBaseline(input: unknown) {
  const value = notificationPreferencesSchema.parse(input);
  return {
    review: value.review,
    block: value.block,
    mention: value.mention,
    done: value.done,
    digest: value.digest,
    digestAt: value.digestAt,
    quiet: value.quiet,
  };
}
function matches(
  value: NotificationPreferences,
  baseline: ReturnType<typeof notificationBaseline>,
) {
  return Object.entries(baseline).every(
    ([key, expected]) => value[key as keyof typeof baseline] === expected,
  );
}
export async function cleanupNotificationBaseline(
  baseline: unknown,
  operations: {
    read(): Promise<unknown>;
    write(value: NotificationPreferences): Promise<unknown>;
    fail(step: string, code: string): never;
  },
) {
  const expected = notificationBaseline(baseline);
  const current = notificationPreferencesSchema.parse(await operations.read());
  // A fresh authoritative read is sufficient when the actual goal already holds.
  if (matches(current, expected)) return;
  const result = notificationPreferencesSchema.parse(
    await operations.write({
      ...expected,
      version: current.version,
    }),
  );
  if (!matches(result, expected))
    operations.fail(
      "notification.confirm-write",
      "notification_baseline_not_restored",
    );
  const fresh = notificationPreferencesSchema.parse(await operations.read());
  if (!matches(fresh, expected))
    operations.fail(
      "notification.confirm-fresh-baseline",
      "notification_baseline_not_restored",
    );
}
