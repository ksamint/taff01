import { expect, it } from "vitest";
import {
  mcpViewsImageArgs,
  parseViewExportHttpQuery,
  viewExportQuerySchema,
} from "./view-export";

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
    { ...query, archived: "include" },
    { ...query, layout: "force" },
    { ...query, scope: "workspace" },
    { ...query, layers: [] },
    { ...query, forceSeed: 7 },
    { calendarMode: "week", visibleDate: "2026-03-08" },
    { view: "timeline", projectId, visibleDate: "2026-03-08" },
  ]) {
    expect(mcpViewsImageArgs.safeParse(bad).success).toBe(false);
    expect(
      viewExportQuerySchema.safeParse({ ...bad, locale: "en" }).success,
    ).toBe(false);
  }
});

it("shares strict graph options between typed MCP and decoded HTTP queries", () => {
  for (const query of [
    { view: "mind", archived: "include" },
    { view: "relations" },
    {
      view: "relations",
      scope: "project",
      projectId,
      layout: "force",
      layers: ["org", "crm"],
      forceSeed: 7,
    },
    { view: "relations", scope: "workspace", layers: [], forceSeed: 0 },
  ]) {
    expect(mcpViewsImageArgs.safeParse(query).success).toBe(true);
    const http = Object.fromEntries(
      Object.entries({ ...query, locale: "en" }).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(",") : String(value),
      ]),
    );
    expect(parseViewExportHttpQuery(http)).toEqual({ ...query, locale: "en" });
  }
  for (const query of [
    { view: "mind", projectId },
    { view: "mind", layout: "force" },
    { view: "mind", calendarMode: "week", visibleDate: "2026-03-08" },
    { view: "relations", calendarMode: "month", visibleDate: "2026-03-08" },
    { view: "relations", archived: "include" },
    { view: "relations", criticalPath: "show" },
    { view: "relations", scope: "project" },
    { view: "relations", scope: "workspace", projectId },
    { view: "relations", layers: ["crm", "crm"] },
    { view: "relations", layers: ["private"] },
    { view: "relations", forceSeed: -1 },
    { view: "relations", forceSeed: 4294967296 },
    { view: "relations", forceSeed: 1.5 },
    { view: "mind", timeZone: "UTC" },
    { view: "mind", nodes: [] },
    { view: "relations", svg: "<svg/>" },
    { layout: "force" },
  ])
    expect(mcpViewsImageArgs.safeParse(query).success).toBe(false);
  for (const forceSeed of ["", "1e2", "7.0", " 7", "-1", "Infinity"])
    expect(() =>
      parseViewExportHttpQuery({ locale: "en", view: "relations", forceSeed }),
    ).toThrow();
});
