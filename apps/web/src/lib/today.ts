import type { Task } from "@taff/schemas";

export function todayTasks(
  tasks: Task[],
  timeZone: string,
  now = new Date(),
): Task[] {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = day.format(now);
  return tasks.filter(
    (task) =>
      task.status !== "done" &&
      (!task.dueAt || day.format(new Date(task.dueAt)) === today),
  );
}
