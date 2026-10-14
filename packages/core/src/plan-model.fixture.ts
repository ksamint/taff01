import type { TaskStatus } from "@taff/schemas";
import type {
  PlanModelDependency,
  PlanModelInput,
  PlanModelTask,
} from "./plan-model";

/*
 * Northwind "Checkout v2" from prototype v2 (taff-store.js CORE.nw, PLAN, DEPS,
 * MILESTONES, FINANCE.chk). Prototype day d is 2026-10-dd; TODAY = 8. A plan
 * starts at due - dur + 1. Statuses map doing → in_progress and review →
 * needs_review; progress is the real status only (no simulated agent steps),
 * so these numbers are the M17 brief acceptance numbers, not the prototype's.
 */
export const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;
export function task(
  id: string,
  due: number,
  dur: number | null,
  status: TaskStatus,
  fields: Partial<PlanModelTask> = {},
): PlanModelTask {
  return {
    id,
    parentId: null,
    title: id,
    status,
    priority: 3,
    dueDate: day(due),
    plan: dur
      ? { startDate: day(due - dur + 1), durationDays: dur, version: 1 }
      : null,
    ownerId: "owner",
    workerId: null,
    workerIsAgent: false,
    blocked: false,
    version: 1,
    ...fields,
  };
}
const child = { parentId: "NW-140" };
export function northwind(today = day(8)): PlanModelInput {
  const deps: [string, string][] = [
    ["NW-133", "NW-139"],
    ["NW-139", "NW-147"],
    ["NW-136", "NW-146"],
    ["NW-144", "NW-146"],
    ["NW-147", "ms-v24"],
    ["NW-146", "ms-v24"],
    ["NW-140", "ms-v24"],
  ];
  const end = (id: string) => ({
    kind: id.startsWith("ms-") ? ("milestone" as const) : ("task" as const),
    id,
  });
  return {
    today,
    tasks: [
      task("NW-140", 15, null, "in_progress", { priority: 1 }),
      task("NW-141", 8, 3, "needs_review", {
        ...child,
        workerId: "ra",
        workerIsAgent: true,
      }),
      task("NW-142", 8, 2, "needs_review", {
        ...child,
        workerId: "oa",
        workerIsAgent: true,
      }),
      task("NW-138", 9, 3, "in_progress", {
        ...child,
        priority: 1,
        workerId: "ca",
        workerIsAgent: true,
      }),
      task("NW-144", 9, 4, "in_progress", {
        ...child,
        priority: 1,
        workerId: "oa",
        workerIsAgent: true,
        blocked: true,
      }),
      task("NW-139", 10, 3, "in_progress", child),
      task("NW-145", 9, 1, "todo", child),
      task("NW-146", 12, 1, "todo"),
      task("NW-147", 13, 2, "todo"),
      task("NW-135", 6, 4, "done"),
      task("NW-133", 5, 5, "done"),
      task("NW-136", 7, 3, "done"),
    ],
    milestones: [
      { id: "ms-v24", name: "v2.4 release", date: day(15), version: 1 },
    ],
    dependencies: deps.map(
      ([from, to]): PlanModelDependency => ({
        id: `${from}>${to}`,
        from: end(from),
        to: end(to),
      }),
    ),
    finance: {
      contractAmount: "1280000.00",
      currency: "HKD",
      collected: "512000.00",
    },
  };
}
