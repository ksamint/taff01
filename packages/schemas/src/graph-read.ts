import {
  array,
  type infer as Infer,
  iso,
  literal,
  maxLength,
  nullable,
  object,
  optional,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema, taskStatusSchema } from "./primitives";

export const GRAPH_NODE_LIMIT = 500;
export const graphNodeSchema = object({
  id: idSchema,
  kind: zodEnum(["project", "task", "person", "agent"]),
  label: string(),
  status: optional(taskStatusSchema),
});
export const graphEdgeSchema = object({
  source: idSchema,
  target: idSchema,
  kind: zodEnum(["project", "parent", "owner", "worker"]),
});
export const workspaceGraphSchema = object({
  workspaceId: idSchema,
  status: zodEnum(["ready", "stale", "unavailable", "disabled", "too_large"]),
  syncedAt: nullable(iso.datetime()),
  nodeLimit: literal(GRAPH_NODE_LIMIT),
  nodes: array(graphNodeSchema).check(maxLength(GRAPH_NODE_LIMIT)),
  edges: array(graphEdgeSchema).check(maxLength(GRAPH_NODE_LIMIT * 4)),
});
export type GraphNode = Infer<typeof graphNodeSchema>;
export type GraphEdge = Infer<typeof graphEdgeSchema>;
export type WorkspaceGraph = Infer<typeof workspaceGraphSchema>;
