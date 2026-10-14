import type { Inbox, InboxItem } from "@taff/schemas/inbox-read";
import { describe, expect, it } from "vitest";
import { needsYouCount, needsYouItems } from "./needs-you";

const item = (kind: InboxItem["kind"], extra: Partial<InboxItem> = {}) =>
  ({
    id: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    memberId: crypto.randomUUID(),
    agentId: null,
    taskId: null,
    runId: null,
    grantId: null,
    digestId: null,
    kind,
    title: kind,
    readAt: null,
    snoozedUntil: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    ...extra,
  }) satisfies InboxItem;
describe("needs-you count", () => {
  it("counts unresolved reviews and blockers, read or not, but never mentions", () => {
    const inbox = {
      items: [
        item("review"),
        item("review", { readAt: new Date().toISOString() }),
        item("blocker"),
        item("mention"),
        item("digest"),
        item("review", { resolvedAt: new Date().toISOString() }),
      ],
      groups: [],
      unreadCount: 4,
      reviewCount: 1,
      blockerCount: 1,
    } satisfies Inbox;
    expect(needsYouCount(inbox)).toBe(3);
    expect(needsYouItems(inbox).map((row) => row.kind)).toEqual([
      "review",
      "review",
      "blocker",
    ]);
    expect(needsYouCount(undefined)).toBe(0);
  });
});
