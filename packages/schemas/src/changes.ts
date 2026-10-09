// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  boolean,
  type infer as Infer,
  maxLength,
  minLength,
  nullable,
  optional,
  regex,
  strictObject,
  string,
} from "zod/mini";
import { idSchema } from "./primitives";
/** Safe routing metadata emitted transactionally by PostgreSQL taff_changes. */
export const changeEventSchema = strictObject({
  recipientOnly: optional(boolean()),
  activityId: idSchema,
  workspaceId: nullable(idSchema),
  resourceId: string().check(minLength(1), maxLength(200)),
  action: string().check(
    regex(
      /^(users|sessions|accounts|verifications|workspaces|members|tasks|agent_tokens|mcp_calls|agent_profiles|agent_permissions|grants|runs|run_events|run_artifacts|review_checks|review_comments|review_items|inbox_items|projects|task_comments|workspace_invites|task_calendar|notification_preferences|daily_digests)\.(insert|update|delete)$/,
    ),
  ),
  actorId: string().check(minLength(1), maxLength(200)),
  userId: nullable(string().check(minLength(1), maxLength(200))),
});
export type ChangeEvent = Infer<typeof changeEventSchema>;
