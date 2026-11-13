// Exported view images (ADR 0031): the query a person sends to turn the
// workspace overview, or one project, into a designed PNG.
import { type infer as Infer, optional, strictObject } from "zod/mini";
import { idSchema, localeSchema } from "./primitives";

export const viewExportQuerySchema = strictObject({
  /** Omitted for the workspace overview (every active project). */
  projectId: optional(idSchema),
  /** The interface language the image is written in. */
  locale: localeSchema,
});
export const mcpViewsImageArgs = strictObject({
  workspaceId: optional(idSchema),
  projectId: optional(idSchema),
  locale: optional(localeSchema),
});
export type ViewExportQuery = Infer<typeof viewExportQuerySchema>;
