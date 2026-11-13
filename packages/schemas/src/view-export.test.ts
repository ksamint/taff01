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

it("requires an explicit calendar window and rejects irrelevant or authority options", () => {
  const query = {
    view: "calendar",
    calendarMode: "week",
    visibleDate: "2026-03-08",
  };
  for (const calendarMode of ["week", "month"]) {
    expect(
      mcpViewsImageArgs.safeParse({ ...query, calendarMode }).success,
    ).toBe(true);
    expect(
      viewExportQuerySchema.safeParse({ ...query, calendarMode, locale: "en" })
        .success,
    ).toBe(true);
  }
  for (const bad of [
    { view: "calendar" },
    { ...query, calendarMode: "day" },
    { ...query, visibleDate: "2026-02-30" },
    { ...query, projectId },
    { ...query, criticalPath: "show" },
    { ...query, timeZone: "UTC" },
    { calendarMode: "week", visibleDate: "2026-03-08" },
    { view: "timeline", projectId, visibleDate: "2026-03-08" },
  ]) {
    expect(mcpViewsImageArgs.safeParse(bad).success).toBe(false);
    expect(
      viewExportQuerySchema.safeParse({ ...bad, locale: "en" }).success,
    ).toBe(false);
  }
});
