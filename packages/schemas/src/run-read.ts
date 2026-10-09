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
import { idSchema, nonnegativeInteger, versionSchema } from "./primitives";
export const runStatusSchema = zodEnum([
  "running",
  "paused",
  "needs_review",
  "changes_requested",
  "completed",
  "canceled",
  "failed",
]);
export const runSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  agentId: idSchema,
  status: runStatusSchema,
  version: versionSchema,
  summary: string(),
  startedAt: iso.datetime(),
  finishedAt: nullable(iso.datetime()),
  updatedAt: iso.datetime(),
  durationMs: nonnegativeInteger,
  costMicros: nonnegativeInteger,
});
export const runListSchema = array(runSchema);
export type Run = Infer<typeof runSchema>;
