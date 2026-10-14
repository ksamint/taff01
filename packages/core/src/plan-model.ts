import type {
  ProjectRisk,
  RiskReason,
  TaskStatus,
  Timeline,
  TimelineDependency,
  TimelineItem,
} from "@taff/schemas";

/**
 * The timeline read model (ADR 0015). A pure function: core loads the rows,
 * this derives spans, progress, lateness, forecasts, conflicts, the critical
 * path and the project risk. Concepts follow prototype v2 `model()`
 * (taff-store.js), with real dates and no simulated agent progress.
 *
 * Day arithmetic runs on whole UTC day numbers. A task occupies the half-open
 * interval [start, end + 1). A milestone is a point at the END of its day
 * (date + 1), so work finishing on the milestone's day is on time, and work
 * that depends on a milestone starts the day after it at the earliest.
 */
export type PlanModelTask = {
  id: string;
  parentId: string | null;
  title: string;
  status: TaskStatus;
  priority: number;
  /** The due instant's civil date in the viewer's time zone. */
  dueDate: string | null;
  plan: { startDate: string; durationDays: number; version: number } | null;
  ownerId: string;
  workerId: string | null;
  workerIsAgent: boolean;
  /** Waiting on a pending permission grant. */
  blocked: boolean;
  version: number;
};
export type PlanModelMilestone = {
  id: string;
  name: string;
  date: string;
  version: number;
};
export type PlanEnd = { kind: "task" | "milestone"; id: string };
export type PlanModelDependency = { id: string; from: PlanEnd; to: PlanEnd };
export type PlanModelInput = {
  /** The viewer's civil date. */
  today: string;
  /** In a stable order (creation order); ties sort by it. */
  tasks: PlanModelTask[];
  milestones: PlanModelMilestone[];
  dependencies: PlanModelDependency[];
  /** Null when the viewer may not read finance (D7). */
  finance: {
    contractAmount: string | null;
    currency: string | null;
    collected: string;
  } | null;
};
export type PlanModel = Omit<
  Timeline,
  "projectId" | "timeZone" | "canEditPlan"
>;

const DAY = 86_400_000;
const PROGRESS: Record<TaskStatus, number> = {
  done: 100,
  needs_review: 90,
  in_progress: 50,
  todo: 0,
};
export const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / DAY;
export const civilDate = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);
/** Default duration of an unplanned task with a due date. */
export const defaultDuration = (priority: number) => (priority === 1 ? 3 : 2);

type Node = {
  key: string;
  kind: "task" | "milestone";
  id: string;
  order: number;
  /** First day (task) or the milestone point. */
  s: number;
  /** Exclusive end (task) or the milestone point. */
  e: number;
  d: number;
  pr: number;
  blocked: boolean;
  parent: string | null;
  children: Node[];
  task?: PlanModelTask;
  milestone?: PlanModelMilestone;
};
const keyOf = (end: PlanEnd) => `${end.kind}:${end.id}`;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildPlanModel(input: PlanModelInput): PlanModel {
  const today = dayNumber(input.today);
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  const order = new Map(input.tasks.map((task, index) => [task.id, index]));
  const childIds = new Map<string, string[]>();
  for (const task of input.tasks)
    if (task.parentId && byId.has(task.parentId))
      childIds.set(task.parentId, [
        ...(childIds.get(task.parentId) ?? []),
        task.id,
      ]);
  const nodes = new Map<string, Node>();
  const resolving = new Set<string>();
  const resolved = new Map<string, Node | null>();
  function resolve(id: string): Node | null {
    if (resolved.has(id)) return resolved.get(id) ?? null;
    // Parents are immutable and acyclic in the database; guard anyway.
    if (resolving.has(id)) return null;
    resolving.add(id);
    const task = byId.get(id) as PlanModelTask;
    const children = (childIds.get(id) ?? [])
      .map(resolve)
      .filter((node): node is Node => node !== null);
    let node: Node | null = null;
    const base = {
      key: `task:${id}`,
      kind: "task" as const,
      id,
      order: order.get(id) ?? 0,
      parent: null,
      children,
      task,
    };
    if (children.length) {
      const s = Math.min(...children.map((child) => child.s));
      const e = Math.max(...children.map((child) => child.e));
      const total = children.reduce((sum, child) => sum + child.d, 0) || 1;
      node = {
        ...base,
        s,
        e,
        d: e - s,
        pr:
          children.reduce((sum, child) => sum + child.pr * child.d, 0) / total,
        blocked: task.blocked || children.some((child) => child.blocked),
      };
    } else if (task.plan) {
      const s = dayNumber(task.plan.startDate);
      node = {
        ...base,
        s,
        e: s + task.plan.durationDays,
        d: task.plan.durationDays,
        pr: PROGRESS[task.status],
        blocked: task.blocked,
      };
    } else if (task.dueDate) {
      const d = defaultDuration(task.priority);
      const e = dayNumber(task.dueDate) + 1;
      node = {
        ...base,
        s: e - d,
        e,
        d,
        pr: PROGRESS[task.status],
        blocked: task.blocked,
      };
    }
    resolving.delete(id);
    resolved.set(id, node);
    if (node) {
      for (const child of children) child.parent = id;
      nodes.set(node.key, node);
    }
    return node;
  }
  for (const task of input.tasks) resolve(task.id);
  const milestones = [...input.milestones].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const [index, milestone] of milestones.entries()) {
    const point = dayNumber(milestone.date) + 1;
    nodes.set(`milestone:${milestone.id}`, {
      key: `milestone:${milestone.id}`,
      kind: "milestone",
      id: milestone.id,
      order: index,
      s: point,
      e: point,
      d: 0,
      pr: 0,
      blocked: false,
      parent: null,
      children: [],
      milestone,
    });
  }

  // Parents before children; top level by start, milestones last.
  const byStart = (a: Node, b: Node) => a.s - b.s || a.order - b.order;
  const tops = [...nodes.values()].filter(
    (node) => node.kind === "task" && node.parent === null,
  );
  tops.sort(byStart);
  const msNodes = [...nodes.values()].filter(
    (node) => node.kind === "milestone",
  );
  const ordered: { node: Node; depth: number }[] = [];
  const visit = (node: Node, depth: number) => {
    ordered.push({ node, depth });
    for (const child of [...node.children].sort(byStart))
      visit(child, depth + 1);
  };
  for (const node of tops) visit(node, 0);
  for (const node of msNodes) ordered.push({ node, depth: 0 });
  const topLevel = [...tops, ...msNodes];

  const deps = input.dependencies.filter(
    (dep) => nodes.has(keyOf(dep.from)) && nodes.has(keyOf(dep.to)),
  );
  const preds = new Map<string, string[]>();
  for (const dep of deps)
    preds.set(keyOf(dep.to), [
      ...(preds.get(keyOf(dep.to)) ?? []),
      keyOf(dep.from),
    ]);

  const expected = (node: Node) =>
    Math.max(0, Math.min(1, (today - node.s) / (node.d || 1))) * 100;
  const behind = (node: Node) => {
    if (node.kind === "milestone" || node.pr >= 100) return 0;
    const late =
      node.s >= today
        ? 0
        : Math.max(0, ((expected(node) - node.pr) / 100) * node.d);
    // Only the task's own blocker adds days; a parent inherits the flag only.
    return node.task?.blocked ? Math.max(late, 2) : late;
  };
  const forecast = new Map<string, number>();
  const visiting = new Set<string>();
  function forecastEnd(key: string): number {
    const known = forecast.get(key);
    if (known !== undefined) return known;
    const node = nodes.get(key) as Node;
    // A cycle (rejected on write, but never trusted here) ends at the plan.
    if (visiting.has(key)) return node.e;
    visiting.add(key);
    let after = 0;
    for (const pred of preds.get(key) ?? [])
      after = Math.max(after, forecastEnd(pred));
    for (const child of node.children)
      after = Math.max(after, forecastEnd(child.key));
    let value: number;
    if (node.kind === "milestone" || node.children.length)
      value = Math.max(node.e, after);
    else if (node.pr >= 100) value = node.e;
    else if (node.s < today)
      value = Math.max(
        node.e + behind(node),
        after + node.d * (1 - node.pr / 100),
      );
    else value = Math.max(node.s, after) + node.d;
    visiting.delete(key);
    forecast.set(key, value);
    return value;
  }
  const lastDay = (point: number) => civilDate(Math.ceil(point - 1e-9) - 1);

  const dependencies: TimelineDependency[] = deps.map((dep) => ({
    id: dep.id,
    from: dep.from,
    to: dep.to,
    conflict:
      (nodes.get(keyOf(dep.to)) as Node).s <
      (nodes.get(keyOf(dep.from)) as Node).e,
  }));

  const critical = new Set<string>();
  if (topLevel.length) {
    let current: Node | undefined = topLevel.reduce((a, x) =>
      x.e >= a.e ? x : a,
    );
    while (current && !critical.has(current.key)) {
      critical.add(current.key);
      const before = (preds.get(current.key) ?? []).map(
        (key) => nodes.get(key) as Node,
      );
      current = before.length
        ? before.reduce((a, x) => (x.e > a.e ? x : a))
        : undefined;
    }
  }

  const items: TimelineItem[] = ordered.map(({ node, depth }) => {
    const task = node.task;
    return {
      kind: node.kind,
      id: node.id,
      title: task ? task.title : (node.milestone as PlanModelMilestone).name,
      parentId: node.parent,
      depth,
      start: task ? civilDate(node.s) : civilDate(node.s - 1),
      end: civilDate(node.e - 1),
      durationDays: node.d,
      planned: !!task?.plan,
      progress: Math.round(node.pr),
      status: task?.status ?? null,
      ownerId: task?.ownerId ?? null,
      workerId: task?.workerId ?? null,
      workerIsAgent: task?.workerIsAgent ?? false,
      blocked: node.blocked,
      hasChildren: node.children.length > 0,
      behindDays: round2(behind(node)),
      forecastEnd: lastDay(forecastEnd(node.key)),
      critical: critical.has(node.key),
      version: task
        ? (task.plan?.version ?? null)
        : (node.milestone as PlanModelMilestone).version,
      taskVersion: task?.version ?? null,
    };
  });

  const finance = input.finance
    ? {
        contractAmount: input.finance.contractAmount,
        collectedAmount: input.finance.collected,
        currency: input.finance.currency,
        collectedPercent:
          input.finance.contractAmount !== null &&
          Number(input.finance.contractAmount) > 0
            ? Math.round(
                (Number(input.finance.collected) /
                  Number(input.finance.contractAmount)) *
                  100,
              )
            : null,
      }
    : null;
  const all = ordered.map(({ node }) => node);
  const leaves = all.filter(
    (node) => node.kind === "task" && !node.children.length,
  );
  const work = leaves.reduce((sum, node) => sum + node.d, 0);
  const deliveryPercent = work
    ? Math.round(leaves.reduce((sum, node) => sum + node.pr * node.d, 0) / work)
    : 0;
  if (!all.length)
    return {
      today: input.today,
      items,
      dependencies,
      risk: {
        level: "low",
        reasons: [],
        start: null,
        plannedEnd: null,
        forecastEnd: null,
        slipDays: 0,
        deliveryPercent,
        driverTaskId: null,
        blockedTaskId: null,
        conflictDependencyId: null,
        lastMilestoneId: null,
        finance,
      },
    };
  const plannedEnd = Math.max(...topLevel.map((node) => node.e));
  const forecastPoint = Math.max(...all.map((node) => forecastEnd(node.key)));
  const slipDays = Math.max(0, Math.round(forecastPoint - plannedEnd));
  const blockedTask = leaves.find((node) => node.blocked) ?? null;
  let driver: Node | null = null;
  let worst = 0.5;
  for (const node of leaves) {
    const late = behind(node);
    if (late > worst && !node.blocked) {
      worst = late;
      driver = node;
    }
  }
  const conflict = dependencies.find((dep) => dep.conflict) ?? null;
  const reasons: RiskReason[] = [];
  if (conflict) reasons.push("dependency_conflict");
  if (slipDays >= 1) reasons.push("slip");
  if (blockedTask) reasons.push("blocked");
  if (driver) reasons.push("behind");
  const level: ProjectRisk["level"] =
    conflict || slipDays >= 3
      ? "high"
      : slipDays >= 1 || blockedTask || driver
        ? "medium"
        : "low";
  return {
    today: input.today,
    items,
    dependencies,
    risk: {
      level,
      reasons,
      start: items.map((item) => item.start).sort()[0] ?? null,
      plannedEnd: civilDate(plannedEnd - 1),
      forecastEnd: civilDate(plannedEnd + slipDays - 1),
      slipDays,
      deliveryPercent,
      driverTaskId: driver?.id ?? null,
      blockedTaskId: blockedTask?.id ?? null,
      conflictDependencyId: conflict?.id ?? null,
      lastMilestoneId: msNodes.at(-1)?.id ?? null,
      finance,
    },
  };
}
