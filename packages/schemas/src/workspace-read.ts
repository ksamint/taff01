// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import { boolean, type infer as Infer, object } from "zod/mini";
export const workspaceAccessSchema = object({
  canCreateTasks: boolean(),
  canManageProjects: boolean(),
  canInvite: boolean(),
  canManageRoles: boolean(),
});
export type WorkspaceAccess = Infer<typeof workspaceAccessSchema>;
