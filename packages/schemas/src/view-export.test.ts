import { expect, it } from "vitest";
import { mcpViewsImageArgs, viewExportQuerySchema } from "./view-export";

const projectId = "00000000-0000-4000-8000-000000000001";
it("preserves legacy summary queries and accepts only applicable timeline options", () => {
  for (const query of [
    {},
    { projectId },
    { view: "overview" },
    { view: "project", projectId },
    { view: "timeline", projectId },
    { view: "timeline", projectId, criticalPath: "hide" },
  ]) {
    expect(
      viewExportQuerySchema.safeParse({ ...query, locale: "en" }).success,
    ).toBe(true);
    expect(mcpViewsImageArgs.safeParse(query).success).toBe(true);
  }
  for (const query of [
    { view: "timeline" },
    { view: "project" },
    { view: "overview", projectId },
    { criticalPath: "hide" },
    { view: "project", projectId, criticalPath: "show" },
    { view: "timeline", projectId, criticalPath: "yes" },
    { view: "timeline", projectId, timeZone: "UTC" },
    { view: "timeline", projectId, zoom: "day" },
  ]) {
    expect(
      viewExportQuerySchema.safeParse({ ...query, locale: "en" }).success,
    ).toBe(false);
    expect(mcpViewsImageArgs.safeParse(query).success).toBe(false);
  }
});
