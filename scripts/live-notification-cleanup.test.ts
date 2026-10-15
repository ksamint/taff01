import { expect, it } from "vitest";
import {
  cleanupNotificationBaseline,
  notificationBaseline,
} from "../e2e/live/notification-cleanup";
import type { NotificationPreferences } from "../packages/schemas/src/notification-preferences";

const baseline = {
  version: 1,
  review: true,
  block: true,
  mention: false,
  done: false,
  digest: true,
  digestAt: "09:00" as const,
  quiet: true,
};
const fail = (step: string, code: string): never => {
  throw new Error(`${step}:${code}`);
};

it("verifies an already restored fresh baseline without a redundant write, ignoring version changes", async () => {
  let writes = 0;
  await cleanupNotificationBaseline(baseline, {
    read: async () => ({ ...baseline, version: 20 }),
    write: async () => {
      writes++;
      throw new Error("unnecessary write");
    },
    fail,
  });
  expect(writes).toBe(0);
  expect(notificationBaseline(baseline)).toEqual({
    review: true,
    block: true,
    mention: false,
    done: false,
    digest: true,
    digestAt: "09:00",
    quiet: true,
  });
});

it("restores changed settings using the latest version and confirms both response and fresh state", async () => {
  let current: NotificationPreferences = {
    ...baseline,
    review: false,
    version: 20,
  };
  let reads = 0;
  const writes: unknown[] = [];
  await cleanupNotificationBaseline(baseline, {
    read: async () => {
      reads++;
      return current;
    },
    write: async (value) => {
      writes.push(value);
      current = { ...value, version: 21 };
      return current;
    },
    fail,
  });
  expect(writes).toEqual([{ ...baseline, version: 20 }]);
  expect(reads).toBe(2);
  expect(notificationBaseline(current)).toEqual(notificationBaseline(baseline));
});

it.each(["wrong-response", "unpersisted-state"])(
  "rejects %s even after an HTTP-successful restore",
  async (mode) => {
    const changed = { ...baseline, quiet: false, version: 9 };
    await expect(
      cleanupNotificationBaseline(baseline, {
        read: async () => changed,
        write: async (value) =>
          mode === "wrong-response" ? changed : { ...value, version: 10 },
        fail,
      }),
    ).rejects.toThrow("notification_baseline_not_restored");
  },
);

it.each(["initial-read", "write", "fresh-read"])(
  "does not waive a transport error at %s",
  async (stage) => {
    let reads = 0;
    await expect(
      cleanupNotificationBaseline(baseline, {
        read: async () => {
          reads++;
          if (
            stage === "initial-read" ||
            (stage === "fresh-read" && reads === 2)
          )
            throw new Error("transport-failed");
          return { ...baseline, done: true, version: 9 };
        },
        write: async (value) => {
          if (stage === "write") throw new Error("transport-failed");
          return { ...value, version: 10 };
        },
        fail,
      }),
    ).rejects.toThrow("transport-failed");
  },
);

it("requires valid shared-schema captured and current preferences", async () => {
  for (const [captured, current] of [
    [{}, baseline],
    [baseline, {}],
  ])
    await expect(
      cleanupNotificationBaseline(captured, {
        read: async () => current,
        write: async () => {
          throw new Error("must not write invalid input");
        },
        fail,
      }),
    ).rejects.toThrow();
});
