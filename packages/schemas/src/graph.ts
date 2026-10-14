// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales.
import {
  array,
  boolean,
  type infer as Infer,
  maxLength,
  nullable,
  object,
  optional,
  refine,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import { idSchema, memberRoleSchema, taskStatusSchema } from "./primitives";

/**
 * Relations graph (plan §4.3, ADR 0015 notes for M16). The layers follow D8:
 * people, dependencies, org and CRM; no value-chain layer.
 */
export const graphLayerSchema = zodEnum([
  "people",
  "dependencies",
  "org",
  "crm",
]);
export const GRAPH_LAYERS = graphLayerSchema.options;
export const graphNodeKindSchema = zodEnum([
  "workspace",
  "project",
  "task",
  "person",
  "agent",
  "company",
  "contact",
]);
export const graphEdgeKindSchema = zodEnum([
  /** workspace → project, project → top-level task, task → subtask. */
  "contains",
  /** person → task they own. */
  "owns",
  /** person or agent → task they work on. */
  "works_on",
  /** successor task → predecessor task (finish-to-start). */
  "depends_on",
  /** CRM company → project it is the client of (D9). */
  "client_of",
  /** CRM contact → project or task they are a stakeholder of. */
  "stakeholder_of",
  /** CRM contact → company that employs them. */
  "contact_of",
  /** person → agent they supervise. */
  "supervises",
]);
/**
 * One node. `key` is `<kind>:<id>` and unique in a graph. CRM nodes carry no
 * phone or email, whoever reads them.
 */
export const graphNodeSchema = object({
  key: string(),
  kind: graphNodeKindSchema,
  id: idSchema,
  label: string(),
  /** Task reference such as NW-141. */
  ref: optional(string()),
  projectId: optional(nullable(idSchema)),
  parentId: optional(nullable(idSchema)),
  status: optional(taskStatusSchema),
  role: optional(memberRoleSchema),
  /** A contact's job title or a company's industry. */
  detail: optional(string()),
});
export const graphEdgeSchema = object({
  key: string(),
  kind: graphEdgeKindSchema,
  layer: graphLayerSchema,
  from: string(),
  to: string(),
});
export const relationGraphSchema = object({
  workspaceId: idSchema,
  projectId: nullable(idSchema),
  layers: array(graphLayerSchema),
  /** False when the reader may not read CRM: no company or contact nodes. */
  crmVisible: boolean(),
  nodes: array(graphNodeSchema),
  edges: array(graphEdgeSchema),
});
const layerList = array(graphLayerSchema).check(
  maxLength(4),
  refine((v) => new Set(v).size === v.length),
);
/** GET /api/workspaces/:id/graph after splitting `layers=a,b`. */
export const graphQuerySchema = strictObject({
  projectId: optional(idSchema),
  layers: optional(layerList),
});
export const mcpRelationsGetArgs = strictObject({
  projectId: optional(idSchema),
  layers: optional(layerList),
});

export type GraphLayer = Infer<typeof graphLayerSchema>;
export type GraphNodeKind = Infer<typeof graphNodeKindSchema>;
export type GraphEdgeKind = Infer<typeof graphEdgeKindSchema>;
export type GraphNode = Infer<typeof graphNodeSchema>;
export type GraphEdge = Infer<typeof graphEdgeSchema>;
export type RelationGraph = Infer<typeof relationGraphSchema>;
export type GraphQuery = Infer<typeof graphQuerySchema>;
