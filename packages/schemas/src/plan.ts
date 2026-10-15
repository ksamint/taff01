// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales.
import {
  array,
  boolean,
  type infer as Infer,
  iso,
  maxLength,
  nullable,
  number,
  object,
  optional,
  refine,
  regex,
  strictObject,
  string,
  trim,
  enum as zodEnum,
} from "zod/mini";
import { taskSchema } from "./base";
import {
  boundedText,
  idSchema,
  nonnegativeInteger,
  taskStatusSchema,
  versionSchema,
} from "./primitives";

/** A civil date, YYYY-MM-DD, that exists in the proleptic Gregorian calendar. */
export const civilDateSchema = string().check(
  regex(/^\d{4}-\d{2}-\d{2}$/),
  refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1970-01-01" &&
      value < "2200-01-01"
    );
  }),
);
export const durationDaysSchema = number().check(
  refine((v) => Number.isInteger(v) && v >= 1 && v <= 3650),
);
/** Money as a decimal string with at most two places (numeric(14,2)). */
export const moneySchema = string().check(regex(/^\d{1,12}(\.\d{1,2})?$/));
export const currencySchema = string().check(regex(/^[A-Z]{3}$/));

export const taskPlanSchema = object({
  taskId: idSchema,
  workspaceId: idSchema,
  startDate: civilDateSchema,
  durationDays: durationDaysSchema,
  version: versionSchema,
  updatedAt: iso.datetime(),
});
/** PATCH /api/tasks/:id/plan. `version` is the plan's, absent for a new plan. */
export const taskPlanInputSchema = strictObject({
  version: optional(versionSchema),
  startDate: civilDateSchema,
  durationDays: durationDaysSchema,
  /** Move the whole subtree by the same number of days (D10). */
  shiftChildren: optional(boolean()),
});
export const milestoneSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  projectId: idSchema,
  name: string(),
  date: civilDateSchema,
  archivedAt: nullable(iso.datetime()),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const milestoneListSchema = array(milestoneSchema);
/**
 * What PATCH /api/tasks/:id/plan changed: `plans` holds the edited task's plan
 * first, then each descendant plan moved by `shiftChildren`; `tasks` holds
 * every task whose `dueAt` moved with a plan or a shift, at its new version.
 */
export const taskPlanResultSchema = object({
  plans: array(taskPlanSchema),
  tasks: array(taskSchema),
});
export const milestoneInputSchema = strictObject({
  name: boundedText(200),
  date: civilDateSchema,
});
export const milestoneUpdateSchema = strictObject({
  version: versionSchema,
  name: optional(boundedText(200)),
  date: optional(civilDateSchema),
  archived: optional(boolean()),
}).check(
  refine(
    (v) =>
      v.name !== undefined || v.date !== undefined || v.archived !== undefined,
  ),
);
/** Exactly one task or milestone on each end of a finish-to-start link. */
export const dependencyInputSchema = strictObject({
  predecessorTaskId: optional(idSchema),
  predecessorMilestoneId: optional(idSchema),
  successorTaskId: optional(idSchema),
  successorMilestoneId: optional(idSchema),
}).check(
  refine(
    (v) =>
      (v.predecessorTaskId === undefined) !==
        (v.predecessorMilestoneId === undefined) &&
      (v.successorTaskId === undefined) !==
        (v.successorMilestoneId === undefined),
  ),
);
export const dependencySchema = object({
  id: idSchema,
  workspaceId: idSchema,
  predecessorTaskId: nullable(idSchema),
  predecessorMilestoneId: nullable(idSchema),
  successorTaskId: nullable(idSchema),
  successorMilestoneId: nullable(idSchema),
  createdAt: iso.datetime(),
});
export const paymentSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  projectId: idSchema,
  amount: moneySchema,
  paidOn: civilDateSchema,
  note: string(),
  createdBy: idSchema,
  createdAt: iso.datetime(),
});
export const paymentListSchema = array(paymentSchema);
export const paymentInputSchema = strictObject({
  amount: moneySchema.check(refine((v) => Number(v) > 0)),
  paidOn: civilDateSchema,
  note: optional(string().check(trim(), maxLength(500))),
});

/** Why a project is at risk; the web localizes the codes. */
export const riskReasonSchema = zodEnum([
  "dependency_conflict",
  "slip",
  "blocked",
  "behind",
]);
export const riskLevelSchema = zodEnum(["low", "medium", "high"]);
export const planEndSchema = object({
  kind: zodEnum(["task", "milestone"]),
  id: idSchema,
});
export const timelineItemSchema = object({
  kind: zodEnum(["task", "milestone"]),
  id: idSchema,
  title: string(),
  parentId: nullable(idSchema),
  depth: nonnegativeInteger,
  /** Inclusive first and last day; a milestone has start = end. */
  start: civilDateSchema,
  end: civilDateSchema,
  durationDays: nonnegativeInteger,
  /** True when the dates come from a stored plan, false for the default. */
  planned: boolean(),
  progress: nonnegativeInteger,
  status: nullable(taskStatusSchema),
  ownerId: nullable(idSchema),
  workerId: nullable(idSchema),
  workerIsAgent: boolean(),
  blocked: boolean(),
  hasChildren: boolean(),
  /** Whole days, rounded up from the progress gap. */
  behindDays: nonnegativeInteger,
  forecastEnd: civilDateSchema,
  critical: boolean(),
  /** Plan version for tasks with a stored plan; milestone version otherwise. */
  version: nullable(versionSchema),
  taskVersion: nullable(versionSchema),
});
export const timelineDependencySchema = object({
  id: idSchema,
  from: planEndSchema,
  to: planEndSchema,
  conflict: boolean(),
});
export const projectRiskSchema = object({
  level: riskLevelSchema,
  reasons: array(riskReasonSchema),
  start: nullable(civilDateSchema),
  plannedEnd: nullable(civilDateSchema),
  forecastEnd: nullable(civilDateSchema),
  slipDays: nonnegativeInteger,
  deliveryPercent: nonnegativeInteger,
  driverTaskId: nullable(idSchema),
  blockedTaskId: nullable(idSchema),
  conflictDependencyId: nullable(idSchema),
  lastMilestoneId: nullable(idSchema),
  /** Finance is null unless the caller may read it (D7). */
  finance: nullable(
    object({
      contractAmount: nullable(moneySchema),
      collectedAmount: moneySchema,
      currency: nullable(currencySchema),
      collectedPercent: nullable(nonnegativeInteger),
    }),
  ),
});
export const timelineSchema = object({
  projectId: idSchema,
  today: civilDateSchema,
  timeZone: string(),
  items: array(timelineItemSchema),
  dependencies: array(timelineDependencySchema),
  risk: projectRiskSchema,
  canEditPlan: boolean(),
});
export const projectFinanceFields = {
  contractAmount: optional(nullable(moneySchema)),
  currency: optional(nullable(currencySchema)),
  clientCompanyId: optional(nullable(idSchema)),
};

export const mcpTimelineGetArgs = strictObject({ projectId: idSchema });
export const mcpTasksPlanArgs = strictObject({
  taskId: idSchema,
  version: optional(versionSchema),
  startDate: civilDateSchema,
  durationDays: durationDaysSchema,
  shiftChildren: optional(boolean()),
});
export const mcpDependenciesAddArgs = dependencyInputSchema;
export const mcpDependenciesRemoveArgs = strictObject({
  dependencyId: idSchema,
});

export type TaskPlan = Infer<typeof taskPlanSchema>;
export type TaskPlanInput = Infer<typeof taskPlanInputSchema>;
export type Milestone = Infer<typeof milestoneSchema>;
export type MilestoneInput = Infer<typeof milestoneInputSchema>;
export type MilestoneUpdate = Infer<typeof milestoneUpdateSchema>;
export type DependencyInput = Infer<typeof dependencyInputSchema>;
export type Dependency = Infer<typeof dependencySchema>;
export type Payment = Infer<typeof paymentSchema>;
export type PaymentInput = Infer<typeof paymentInputSchema>;
export type RiskReason = Infer<typeof riskReasonSchema>;
export type RiskLevel = Infer<typeof riskLevelSchema>;
export type TimelineItem = Infer<typeof timelineItemSchema>;
export type TimelineDependency = Infer<typeof timelineDependencySchema>;
export type ProjectRisk = Infer<typeof projectRiskSchema>;
export type Timeline = Infer<typeof timelineSchema>;
export type TaskPlanResult = Infer<typeof taskPlanResultSchema>;
