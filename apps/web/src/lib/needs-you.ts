import type { Inbox, InboxItem } from "@taff/schemas/inbox-read";

/**
 * One count everywhere (plan §2.4 item 1): unresolved reviews and blockers
 * the person must act on. Mentions stay in Inbox › All and do not count.
 */
export function needsYouItems(inbox: Inbox | undefined): InboxItem[] {
  return (inbox?.items ?? []).filter(
    (item) =>
      !item.resolvedAt && (item.kind === "review" || item.kind === "blocker"),
  );
}
export const needsYouCount = (inbox: Inbox | undefined) =>
  needsYouItems(inbox).length;
