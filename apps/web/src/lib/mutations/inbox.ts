// Inbox item mutations (read, unread, snooze and undo snooze).
import {
  type Inbox,
  type InboxItem,
  type InboxItemInput,
  inboxItemInputSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { invalidateM3 } from "../m3-queries";
import { inboxFromItems, m3MutationKey, snapshotM3 } from "../optimistic-m3";
import { inboxKey } from "../queries";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";

export type InboxUpdate = {
  id: string;
  body: InboxItemInput;
  /** The item being snoozed, kept so the undo can restore it. */
  snooze?: InboxItem;
  /** True when this write undoes the last snooze. */
  undo?: boolean;
};

/**
 * The inbox after one item's read or snooze change. An undo puts the snoozed
 * item back when the cache no longer holds it.
 */
export function withInboxUpdate(
  current: Inbox | undefined,
  { id, body, undo }: Pick<InboxUpdate, "id" | "body" | "undo">,
  snoozed: InboxItem | null,
  now: string,
  snoozedView = false,
) {
  if (!current) return current;
  const items =
    (undo || body.snoozedUntil !== undefined) &&
    snoozed &&
    !current.items.some((item) => item.id === id)
      ? [snoozed, ...current.items]
      : current.items;
  return inboxFromItems(
    items.map((item) =>
      item.id !== id
        ? item
        : {
            ...item,
            ...(body.read === undefined
              ? {}
              : { readAt: body.read ? now : null }),
            ...(body.snoozedUntil === undefined
              ? {}
              : { snoozedUntil: body.snoozedUntil }),
          },
    ),
    snoozedView,
  );
}

/**
 * Updates an inbox item. `snoozed` is the item the undo bar restores;
 * `onSnoozedChange` receives the new undo target (or null after an undo).
 */
export function useUpdateInboxItem(
  workspaceId: string,
  {
    snoozed,
    onSnoozedChange,
  }: {
    snoozed: InboxItem | null;
    onSnoozedChange?: (item: InboxItem | null) => void;
  },
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, body }: InboxUpdate) =>
      request(`/api/inbox/${id}`, {
        method: "PATCH",
        body: JSON.stringify(inboxItemInputSchema.parse(body)),
      }),
    onMutate: async (input) => {
      const snapshot = await snapshotM3(client);
      const target =
        input.snooze ??
        (snoozed?.id === input.id ? snoozed : null) ??
        client
          .getQueriesData<Inbox>({ queryKey: inboxKey(workspaceId) })
          .flatMap(([, inbox]) => inbox?.items ?? [])
          .find((item) => item.id === input.id) ??
        null;
      for (const query of client
        .getQueryCache()
        .findAll({ queryKey: inboxKey(workspaceId) })) {
        client.setQueryData<Inbox>(query.queryKey, (current) =>
          withInboxUpdate(
            current,
            input,
            target,
            new Date().toISOString(),
            query.queryKey[2] === "snoozed",
          ),
        );
      }
      return snapshot;
    },
    onSuccess: (_, input, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      if (input.snooze) onSnoozedChange?.(input.snooze);
      else if (input.undo) onSnoozedChange?.(null);
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}
