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
import { civilDateSchema } from "./plan";
import { boundedText, idSchema, versionSchema } from "./primitives";

/*
 * Mind map (M18, D8: per workspace). Nodes sit on rings (layer) at an angle;
 * strength 1–5 and momentum −2..2 are a person's judgement. Notes are a
 * person's notes, never model output (plan §2.4 item 12).
 */
const intIn = (min: number, max: number) =>
  number().check(refine((v) => Number.isInteger(v) && v >= min && v <= max));
export const mindLayerSchema = intIn(0, 9);
/** Degrees clockwise from the top, [0, 360), two decimals at most. */
export const mindAngleSchema = number().check(
  refine((v) => v >= 0 && v < 360 && Math.round(v * 100) === v * 100),
);
export const mindStrengthSchema = intIn(1, 5);
export const mindMomentumSchema = intIn(-2, 2);
const noteSchema = string().check(trim(), maxLength(4000));
export const mindUrlSchema = string().check(
  trim(),
  maxLength(2000),
  regex(/^https?:\/\/\S+$/),
);
export const mindEdgeKindSchema = zodEnum([
  "relates",
  "supports",
  "contradicts",
]);

export const mindNodeSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  title: string(),
  layer: mindLayerSchema,
  angle: number(),
  strength: mindStrengthSchema,
  momentum: mindMomentumSchema,
  note: string(),
  taskId: nullable(idSchema),
  archivedAt: nullable(iso.datetime()),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const mindEdgeSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  fromNodeId: idSchema,
  toNodeId: idSchema,
  kind: mindEdgeKindSchema,
  createdAt: iso.datetime(),
});
export const mindSourceSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  title: string(),
  url: nullable(string()),
  note: string(),
  archivedAt: nullable(iso.datetime()),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const mindNodeSourceSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  nodeId: idSchema,
  sourceId: idSchema,
  createdAt: iso.datetime(),
});
/** GET /api/workspaces/:id/mind: the active map, or everything with archived. */
export const mindMapSchema = object({
  workspaceId: idSchema,
  nodes: array(mindNodeSchema),
  edges: array(mindEdgeSchema),
  sources: array(mindSourceSchema),
  nodeSources: array(mindNodeSourceSchema),
  canWrite: boolean(),
  canArchive: boolean(),
});
export const mindMapQuerySchema = strictObject({
  archived: optional(zodEnum(["include", "exclude"])),
});

export const mindNodeInputSchema = strictObject({
  title: boundedText(200),
  layer: mindLayerSchema,
  angle: mindAngleSchema,
  strength: optional(mindStrengthSchema),
  momentum: optional(mindMomentumSchema),
  note: optional(noteSchema),
});
export const mindNodeUpdateSchema = strictObject({
  version: versionSchema,
  title: optional(boundedText(200)),
  layer: optional(mindLayerSchema),
  angle: optional(mindAngleSchema),
  strength: optional(mindStrengthSchema),
  momentum: optional(mindMomentumSchema),
  note: optional(noteSchema),
  /** Archive (admins, D4-style undo); false restores. */
  archived: optional(boolean()),
}).check(refine((v) => Object.keys(v).length > 1));
export const mindEdgeInputSchema = strictObject({
  fromNodeId: idSchema,
  toNodeId: idSchema,
  kind: optional(mindEdgeKindSchema),
}).check(refine((v) => v.fromNodeId !== v.toNodeId));
export const mindSourceInputSchema = strictObject({
  title: boundedText(300),
  url: optional(nullable(mindUrlSchema)),
  note: optional(noteSchema),
});
export const mindSourceUpdateSchema = strictObject({
  version: versionSchema,
  title: optional(boundedText(300)),
  url: optional(nullable(mindUrlSchema)),
  note: optional(noteSchema),
  archived: optional(boolean()),
}).check(refine((v) => Object.keys(v).length > 1));
/**
 * "Turn into a validation task": a real task owned by the signed-in person,
 * due at 23:59 on `dueDate` in their time zone, linked to the node.
 */
export const mindValidationTaskInputSchema = strictObject({
  version: versionSchema,
  dueDate: civilDateSchema,
  title: optional(boundedText(200)),
  projectId: optional(nullable(idSchema)),
});
export const mindValidationTaskResultSchema = object({
  node: mindNodeSchema,
  task: taskSchema,
});

export type MindNode = Infer<typeof mindNodeSchema>;
export type MindEdge = Infer<typeof mindEdgeSchema>;
export type MindSource = Infer<typeof mindSourceSchema>;
export type MindNodeSource = Infer<typeof mindNodeSourceSchema>;
export type MindMap = Infer<typeof mindMapSchema>;
export type MindMapQuery = Infer<typeof mindMapQuerySchema>;
export type MindNodeInput = Infer<typeof mindNodeInputSchema>;
export type MindNodeUpdate = Infer<typeof mindNodeUpdateSchema>;
export type MindEdgeInput = Infer<typeof mindEdgeInputSchema>;
export type MindSourceInput = Infer<typeof mindSourceInputSchema>;
export type MindSourceUpdate = Infer<typeof mindSourceUpdateSchema>;
export type MindValidationTaskInput = Infer<
  typeof mindValidationTaskInputSchema
>;
export type MindValidationTaskResult = Infer<
  typeof mindValidationTaskResultSchema
>;
