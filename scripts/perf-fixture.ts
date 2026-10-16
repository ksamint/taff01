import assert from "node:assert/strict";
import type { APIRequestContext } from "@playwright/test";
import {
  meSchema,
  projectSchema,
  taskSchema,
} from "../packages/schemas/src/index";

export const performanceMarkers = {
  today: "today-heading",
  projects: "project-view-board",
  calendar: "calendar-scene",
  timeline: "timeline-view",
} as const;
export type PerformanceRoute = keyof typeof performanceMarkers;

// Each measurement includes real project, scheduled calendar and timeline rows.
// Setup is outside throttling; browser cache and persisted data are cleared later.
export async function performanceFixture(
  request: APIRequestContext,
  origin: string,
  route: PerformanceRoute,
) {
  const me = meSchema.parse(
    await (await request.get(`${origin}/api/me`)).json(),
  );
  const workspace = me.workspaces[0];
  assert(workspace, "Audit account needs a workspace");
  const headers = { Origin: origin };
  const response = await request.post(
    `${origin}/api/projects?workspaceId=${workspace.id}`,
    {
      headers,
      data: { name: "Performance audit project" },
    },
  );
  assert(response.ok(), "Audit project creation failed");
  const project = projectSchema.parse(await response.json());
  const date = new Date().toISOString().slice(0, 10);
  for (let index = 0; index < 20; index++) {
    const hour = 9 + (index % 8);
    const startAt = `${date}T${String(hour).padStart(2, "0")}:00:00Z`;
    const endAt = `${date}T${String(hour + 1).padStart(2, "0")}:00:00Z`;
    const created = await request.post(`${origin}/api/tasks`, {
      headers,
      data: {
        workspaceId: workspace.id,
        ownerId: workspace.memberId,
        projectId: project.id,
        title: `Today audit task ${index + 1}`,
        priority: (index % 4) + 1,
        dueAt: startAt,
        calendar: { startAt, endAt, timeZone: "UTC", rrule: null },
      },
    });
    assert(created.ok(), "Audit task creation failed");
    const task = taskSchema.parse(await created.json());
    const planned = await request.patch(`${origin}/api/tasks/${task.id}/plan`, {
      headers,
      data: { startDate: date, durationDays: 2 },
    });
    assert(planned.ok(), "Audit timeline planning failed");
  }
  return route === "today"
    ? "/"
    : route === "calendar"
      ? "/calendar"
      : `/projects/${project.id}${route === "timeline" ? "?view=timeline" : ""}`;
}
