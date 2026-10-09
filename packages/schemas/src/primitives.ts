// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  array,
  maxLength,
  minLength,
  nullable,
  number,
  optional,
  refine,
  strictObject,
  string,
  trim,
  uuid,
  enum as zodEnum,
} from "zod/mini";
export const timeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const localeSchema = zodEnum(["en", "zh-CN", "zh-HK"]);
export const taskStatusSchema = zodEnum([
  "todo",
  "in_progress",
  "needs_review",
  "done",
]);
export const idSchema = uuid();
export const workspaceQuerySchema = strictObject({ workspaceId: idSchema });
export const prioritySchema = number().check(
  refine((v) => Number.isInteger(v) && v >= 1 && v <= 4),
);
export const labelsSchema = array(
  string().check(trim(), minLength(1), maxLength(40)),
).check(
  maxLength(20),
  refine((v) => new Set(v).size === v.length),
);
export const memberRoleSchema = zodEnum(["admin", "member", "guest"]);
export const taskFields = {
  description: optional(string().check(maxLength(20000))),
  priority: optional(prioritySchema),
  projectId: optional(nullable(idSchema)),
  labels: optional(labelsSchema),
};
export const nonnegativeInteger = number().check(
  refine((value) => Number.isSafeInteger(value) && value >= 0),
);
export const positiveInteger = number().check(
  refine((value) => Number.isSafeInteger(value) && value > 0),
);
export const versionSchema = positiveInteger;
export const boundedText = (max: number) =>
  string().check(trim(), minLength(1), maxLength(max));
