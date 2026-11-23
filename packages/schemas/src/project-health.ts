import {
  array,
  type infer as Infer,
  iso,
  nullable,
  refine,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema } from "./primitives";

export const projectHealth = ["on_track", "at_risk", "off_track"] as const;
const health = zodEnum(projectHealth);
const body = string().check(
  refine((text) => !text.includes("\0") && Array.from(text).length <= 2000),
);
export const projectHealthUpdateInputSchema = strictObject({
  projectId: idSchema,
  health,
  body,
});
export const projectHealthUpdateSchema = strictObject({
  id: idSchema,
  workspaceId: idSchema,
  projectId: idSchema,
  authorId: idSchema,
  health,
  body,
  createdAt: iso.datetime(),
});
export const projectHealthUpdateListSchema = strictObject({
  updates: array(projectHealthUpdateSchema),
  nextCursor: nullable(idSchema),
});
export type ProjectHealthUpdate = Infer<typeof projectHealthUpdateSchema>;
