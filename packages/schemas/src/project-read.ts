// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  array,
  boolean,
  type infer as Infer,
  iso,
  nullable,
  number,
  object,
  refine,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema, versionSchema } from "./primitives";
/** Commercial stages in order (ADR 0021). */
export const PROJECT_STAGES = [
  "lead",
  "proposal_sent",
  "contract_signed",
  "in_service",
  "closed",
] as const;
export const projectStageSchema = zodEnum(PROJECT_STAGES);
export const projectSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  name: string(),
  dueAt: nullable(iso.datetime()),
  deliveryProgress: number().check(
    refine((v) => Number.isInteger(v) && v >= 0 && v <= 100),
  ),
  receivedAmount: nullable(string()),
  archived: boolean(),
  version: versionSchema,
  /** Null unless the reader may see finance (ADR 0021). */
  contractAmount: nullable(string()),
  currency: nullable(string()),
  clientCompanyId: nullable(idSchema),
  stage: nullable(projectStageSchema),
  /** Person in charge: a person member of the workspace. */
  leadId: nullable(idSchema),
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const projectListSchema = array(projectSchema);
export type Project = Infer<typeof projectSchema>;
export type ProjectStage = Infer<typeof projectStageSchema>;
