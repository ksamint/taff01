// Export queries share one strict contract across REST, MCP and core.
import {
  type infer as Infer,
  optional,
  refine,
  strictObject,
  enum as zodEnum,
} from "zod/mini";
import { relationsImageOptionsSchema } from "./graph-image";
import { civilDateSchema } from "./plan";
import { idSchema, localeSchema } from "./primitives";

const viewFields = {
  projectId: optional(idSchema),
  view: optional(
    zodEnum([
      "overview",
      "project",
      "timeline",
      "calendar",
      "mind",
      "relations",
    ]),
  ),
  criticalPath: optional(zodEnum(["show", "hide"])),
  archived: optional(zodEnum(["include", "exclude"])),
  layout: optional(relationsImageOptionsSchema.shape.layout),
  scope: optional(relationsImageOptionsSchema.shape.scope),
  layers: optional(relationsImageOptionsSchema.shape.layers),
  forceSeed: optional(relationsImageOptionsSchema.shape.forceSeed),
  calendarMode: optional(zodEnum(["week", "month"])),
  visibleDate: optional(civilDateSchema),
};
const validView = (value: {
  projectId?: string;
  view?: string;
  criticalPath?: string;
  calendarMode?: string;
  visibleDate?: string;
  archived?: string;
  layout?: string;
  scope?: string;
  layers?: unknown;
  forceSeed?: number;
}) =>
  (!(value.view === "timeline" || value.view === "project") ||
    !!value.projectId) &&
  (!["overview", "calendar", "mind"].includes(value.view ?? "") ||
    !value.projectId) &&
  (value.criticalPath === undefined || value.view === "timeline") &&
  (value.archived === undefined || value.view === "mind") &&
  ([value.layout, value.scope, value.layers, value.forceSeed].every(
    (v) => v === undefined,
  ) ||
    value.view === "relations") &&
  (value.scope === undefined ||
    (value.scope === "project") === !!value.projectId) &&
  (value.view === "calendar"
    ? !!value.calendarMode && !!value.visibleDate
    : value.calendarMode === undefined && value.visibleDate === undefined);
export const viewExportQuerySchema = strictObject({
  ...viewFields,
  locale: localeSchema,
}).check(refine(validView));
export const mcpViewsImageArgs = strictObject({
  ...viewFields,
  workspaceId: optional(idSchema),
  locale: optional(localeSchema),
}).check(refine(validView));
export type ViewExportQuery = Infer<typeof viewExportQuerySchema>;
export type ViewExportInputQuery = Omit<ViewExportQuery, "locale"> & {
  locale?: ViewExportQuery["locale"];
};

/** Decode only the two typed HTTP fields; strict validation still rejects unknown keys. */
export function parseViewExportHttpQuery(
  query: Record<string, string>,
): ViewExportQuery {
  return viewExportQuerySchema.parse({
    ...query,
    ...(query.layers === undefined
      ? {}
      : { layers: query.layers === "" ? [] : query.layers.split(",") }),
    ...(query.forceSeed === undefined
      ? {}
      : {
          forceSeed: /^(0|[1-9]\d{0,9})$/.test(query.forceSeed)
            ? Number(query.forceSeed)
            : query.forceSeed,
        }),
  });
}
