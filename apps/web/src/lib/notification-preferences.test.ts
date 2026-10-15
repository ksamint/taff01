import type { NotificationPreferences } from "@taff/schemas/notification-preferences";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  notificationPreferencesKey,
  readNotificationPreferences,
} from "./notification-preferences";

const initial: NotificationPreferences = {
  review: true,
  block: true,
  mention: true,
  done: true,
  digest: true,
  quiet: false,
  digestAt: "09:00",
  version: 1,
};
it("keeps a choice made while a mount refetch is in flight, then accepts a newer remote version", async () => {
  const client = new QueryClient();
  client.setQueryData(notificationPreferencesKey, initial);
  let release!: (value: NotificationPreferences) => void;
  const pending = readNotificationPreferences(
    client,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  client.setQueryData(notificationPreferencesKey, {
    ...initial,
    digestAt: "08:00",
  });
  release(initial);
  expect(await pending).toMatchObject({ version: 1, digestAt: "08:00" });
  expect(
    await readNotificationPreferences(client, async () => ({
      ...initial,
      version: 2,
      digestAt: "18:00",
    })),
  ).toMatchObject({ version: 2, digestAt: "18:00" });
});
it("does not let an older read overwrite a completed save, and loads an empty cache", async () => {
  const client = new QueryClient();
  expect(
    await readNotificationPreferences(client, async () => initial),
  ).toEqual(initial);
  client.setQueryData(notificationPreferencesKey, {
    ...initial,
    version: 3,
    digestAt: "18:00",
  });
  expect(
    await readNotificationPreferences(client, async () => initial),
  ).toMatchObject({ version: 3, digestAt: "18:00" });
});
