// Export queries share one strict contract across REST, MCP and core.
import {
  type infer as Infer,
  optional,
  refine,
  strictObject,
  enum as zodEnum,
} from "zod/mini";
import { civilDateSchema } from "./plan";
import { idSchema, localeSchema } from "./primitives";

const viewFields = {
  projectId: optional(idSchema),
  view: optional(zodEnum(["overview", "project", "timeline", "calendar"])),
  criticalPath: optional(zodEnum(["show", "hide"])),
  calendarMode: optional(zodEnum(["week", "month"])),
  visibleDate: optional(civilDateSchema),
};
const validView = (value: {
  projectId?: string;
  view?: string;
  criticalPath?: string;
  calendarMode?: string;
  visibleDate?: string;
}) =>
  (!(value.view === "timeline" || value.view === "project") ||
    !!value.projectId) &&
  (!(value.view === "overview" || value.view === "calendar") ||
    !value.projectId) &&
  (value.criticalPath === undefined || value.view === "timeline") &&
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
