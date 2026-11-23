import {
  array,
  type infer as Infer,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema } from "./primitives";

export const taskLinkKinds = ["related", "duplicate"] as const;
const kind = zodEnum(taskLinkKinds);
export const taskLinkInputSchema = strictObject({
  fromTaskId: idSchema,
  toTaskId: idSchema,
  kind,
});
export const taskLinkSchema = strictObject({
  id: idSchema,
  fromTaskId: idSchema,
  toTaskId: idSchema,
  otherTaskId: idSchema,
  otherTaskTitle: string(),
  kind,
});
export const taskLinkListSchema = array(taskLinkSchema);
export type TaskLink = Infer<typeof taskLinkSchema>;
