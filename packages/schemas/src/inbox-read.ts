// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  array,
  type infer as Infer,
  iso,
  nullable,
  object,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema, nonnegativeInteger } from "./primitives";
export const inboxItemSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  memberId: idSchema,
  agentId: nullable(idSchema),
  taskId: nullable(idSchema),
  runId: nullable(idSchema),
  grantId: nullable(idSchema),
  kind: zodEnum(["review", "blocker", "mention", "done", "digest"]),
  digestId: nullable(idSchema),
  title: string(),
  readAt: nullable(iso.datetime()),
  snoozedUntil: nullable(iso.datetime()),
  resolvedAt: nullable(iso.datetime()),
  createdAt: iso.datetime(),
});
export const inboxSchema = object({
  items: array(inboxItemSchema),
  groups: array(
    object({ taskId: nullable(idSchema), items: array(inboxItemSchema) }),
  ),
  unreadCount: nonnegativeInteger,
  reviewCount: nonnegativeInteger,
  blockerCount: nonnegativeInteger,
});
export type InboxItem = Infer<typeof inboxItemSchema>;
export type Inbox = Infer<typeof inboxSchema>;
