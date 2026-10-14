// Pure view model for the Projects board and list (prototype v2 lines
// 249–369 and 1538–1572): views, filters, ordering and short names.
import type { Member, Task, TaskStatus } from "@taff/schemas/base";

export const PROJECT_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "needs_review",
  "done",
];

export const PROJECT_VIEWS = [
  "board",
  "list",
  "timeline",
  "stakeholders",
  "relations",
  "mind",
] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];
/** Views behind 更多 (prototype `moreMenu`): 相關方 · 關係圖 · 心智圖. */
export const MORE_VIEWS = ["stakeholders", "relations", "mind"] as const;
/** Views that ship later (M18 mind). */
export const PLANNED_VIEWS: ProjectView[] = ["mind"];

/** `?view=` with the board as the default for anything unknown. */
export function parseProjectView(value: string | null | undefined) {
  return (PROJECT_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as ProjectView)
    : "board";
}

export type TaskFilter = "all" | "mine" | "agents";
export type ProjectSort = "created" | "due" | "priority" | "title";

export type TaskQuery = {
  projectId: string;
  filter: TaskFilter;
  /** Agent member id from `?agent=`; it narrows the filter to that worker. */
  agentId: string | null;
  label: string;
  memberId: string;
  members: Member[];
};

export function filterProjectTasks(tasks: Task[], query: TaskQuery): Task[] {
  const agents = new Set(
    query.members.filter((item) => item.kind === "agent").map((m) => m.id),
  );
  const label = query.label.trim().toLocaleLowerCase();
  return tasks.filter(
    (task) =>
      (!query.projectId || task.projectId === query.projectId) &&
      (!label ||
        task.labels.some((item) => item.toLocaleLowerCase().includes(label))) &&
      (query.agentId
        ? task.workerId === query.agentId
        : query.filter === "all" ||
          (query.filter === "mine"
            ? task.ownerId === query.memberId
            : task.workerId !== null && agents.has(task.workerId))),
  );
}

export function sortProjectTasks(
  tasks: Task[],
  sort: ProjectSort,
  locale: string,
): Task[] {
  return [...tasks].sort((a, b) =>
    sort === "priority"
      ? a.priority - b.priority
      : sort === "due"
        ? (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
        : sort === "title"
          ? a.title.localeCompare(b.title, locale)
          : b.createdAt.localeCompare(a.createdAt),
  );
}

export type NestedTask = { task: Task; nested: boolean };

/**
 * Parents followed by their descendants, keeping the given order (prototype
 * `pGroups` and `deskRows`). A task whose parent is not in the list starts
 * its own branch; `nested` is true when it is shown under its parent.
 */
export function nestByParent(tasks: Task[]): NestedTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const children = new Map<string, Task[]>();
  for (const task of tasks)
    if (task.parentId && ids.has(task.parentId))
      children.set(task.parentId, [
        ...(children.get(task.parentId) ?? []),
        task,
      ]);
  const rows: NestedTask[] = [];
  const seen = new Set<string>();
  const visit = (task: Task, nested: boolean) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    rows.push({ task, nested });
    for (const child of children.get(task.id) ?? []) visit(child, true);
  };
  for (const task of tasks)
    if (!task.parentId || !ids.has(task.parentId)) visit(task, false);
  // A parent cycle has no root; show what is left flat rather than drop it.
  for (const task of tasks) visit(task, false);
  return rows;
}

/** Chip name: "Research" for "Research Agent", 調研 for 調研智能體. */
export function agentShortName(name: string) {
  return name.replace(/\s*Agent$|智能體$|智能体$/, "") || name;
}

/** Avatar letters: "LX" for "Lin Xiao", 林 for 林曉. */
export function memberInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => [...part][0])
    .join("")
    .toUpperCase();
}
