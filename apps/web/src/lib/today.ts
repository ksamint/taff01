import type { Task } from "@taff/schemas";

export function todayTasks(
  tasks: Task[],
  timeZone: string,
  now = new Date(),
): { due: Task[]; undated: Task[] } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = day.format(now);
  const due: Task[] = [];
  const undated: Task[] = [];
  for (const task of tasks) {
    if (task.status === "done") continue;
    if (task.dueAt) {
      if (day.format(new Date(task.dueAt)) === today) due.push(task);
    } else if (!task.labels.includes("meeting")) {
      undated.push(task);
    }
  }
  return { due, undated };
}
