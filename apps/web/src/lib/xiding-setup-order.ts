import type { Task } from "@taff/schemas/base";
import { GENERIC_OPERATION_SECTORS } from "@taff/schemas/operation-templates";

export const XIDING_WORKSPACE = "XIDING";

export function orderXidingSetupTasks(tasks: Task[], workspaceName: string) {
  if (workspaceName !== XIDING_WORKSPACE) return tasks;

  const setup = tasks.flatMap((task, index) => {
    const rank = GENERIC_OPERATION_SECTORS.findIndex(
      ({ label }) =>
        task.title === `設定指標目標 · ${label}` && task.labels.includes(label),
    );
    return rank < 0 ? [] : [{ task, index, rank }];
  });
  if (setup.length < 2) return tasks;

  // Keep every ordinary task in its existing position.
  const ordered = [...setup].sort((a, b) => a.rank - b.rank);
  const result = [...tasks];
  setup.forEach(({ index }, position) => {
    result[index] = ordered[position].task;
  });
  return result;
}
