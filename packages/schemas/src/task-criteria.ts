import {
  array,
  type infer as Infer,
  int,
  iso,
  minimum,
  nullable,
  refine,
  strictObject,
  string,
} from "zod/mini";
import { idSchema } from "./primitives";

const text = string().check(
  refine(
    (value) =>
      !value.includes("\0") &&
      value.trim().length > 0 &&
      Array.from(value).length <= 300,
  ),
);
export const taskCriterionSchema = strictObject({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  position: int().check(minimum(0)),
  text,
  checkedBy: nullable(idSchema),
  checkedAt: nullable(iso.datetime()),
});
export const taskCriteriaListSchema = array(taskCriterionSchema);
export const taskCriterionInputSchema = strictObject({
  taskId: idSchema,
  text,
});
export const taskCriterionEditSchema = strictObject({ text });
export const taskCriteriaReorderSchema = strictObject({
  taskId: idSchema,
  ids: array(idSchema),
});
export type TaskCriterion = Infer<typeof taskCriterionSchema>;
