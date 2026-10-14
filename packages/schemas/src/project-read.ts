// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  boolean,
  type infer as Infer,
  iso,
  nullable,
  object,
  string,
} from "zod/mini";
import { idSchema, versionSchema } from "./primitives";
export const projectSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  name: string(),
  archived: boolean(),
  version: versionSchema,
  /** Null unless the reader may see finance (D7). */
  contractAmount: nullable(string()),
  currency: nullable(string()),
  clientCompanyId: nullable(idSchema),
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export type Project = Infer<typeof projectSchema>;
