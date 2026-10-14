// Timeline writes (M16): plans, milestone dates and dependencies. Each write
// is optimistic on the timeline cache, rolls back on error, sends the plan
// or milestone `version`, and toasts with 撤銷 whose undo calls the inverse
// API operation with the new version (plan §2.4), never a cache snapshot.
import {
  type Dependency,
  type DependencyInput,
  dependencySchema,
  milestoneSchema,
  type TaskPlanInput,
  type Timeline,
  type TimelineDependency,
  type TimelineItem,
  taskPlanResultSchema,
} from "@taff/schemas/plan";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../api";
import { restoreQueries, snapshotQueries } from "../query-snapshot";
import { applyPlanChange } from "../timeline-geometry";
import { timelineKey } from "../timeline-queries";
import { showToast } from "../toast";

export const timelineMutationKey = ["timeline-write"] as const;
/** Families a plan or dependency write can change. */
const FAMILIES = [
  "timeline",
  "milestones",
  "graph",
  "tasks",
  "task",
  "calendar",
  "task-calendar",
  "brief",
];

export type PlanEnd = { kind: "task" | "milestone"; id: string };
export type PlanChange = {
  item: TimelineItem;
  startDate: string;
  durationDays: number;
  /** Which toast to show: a move, a resize, or a form edit (a move). */
  reason: "move" | "resize";
};

function invalidateTimeline(client: QueryClient) {
  if (client.isMutating({ mutationKey: timelineMutationKey }) > 1) return;
  return client.invalidateQueries({
    predicate: ({ queryKey }) => FAMILIES.includes(String(queryKey[0])),
  });
}

/** A parent bar moves its whole subtree (D10). */
export const shiftsChildren = (item: TimelineItem) =>
  item.kind === "task" && item.hasChildren;

/**
 * PATCH a task plan or a milestone date; resolves to the new version, which
 * the undo sends back with the previous dates.
 */
async function sendPlan(
  item: TimelineItem,
  version: number | null,
  startDate: string,
  durationDays: number,
): Promise<number> {
  if (item.kind === "milestone") {
    const saved = milestoneSchema.parse(
      await request(`/api/milestones/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version, date: startDate }),
      }),
    );
    return saved.version;
  }
  const body: TaskPlanInput = {
    ...(version === null ? {} : { version }),
    startDate,
    durationDays,
    ...(shiftsChildren(item) ? { shiftChildren: true } : {}),
  };
  const result = taskPlanResultSchema.parse(
    await request(`/api/tasks/${item.id}/plan`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
  const plan = result.plans[0];
  if (!plan) throw new ApiError("internal_error");
  return plan.version;
}
/** The plan version a write must send: absent before the first plan. */
const planVersion = (item: TimelineItem) =>
  item.kind === "task" && !item.planned ? null : item.version;

function dependencyBody(from: PlanEnd, to: PlanEnd): DependencyInput {
  return {
    ...(from.kind === "task"
      ? { predecessorTaskId: from.id }
      : { predecessorMilestoneId: from.id }),
    ...(to.kind === "task"
      ? { successorTaskId: to.id }
      : { successorMilestoneId: to.id }),
  };
}
/** The two ends of a stored dependency row. */
export function dependencyEnds(row: Dependency): {
  from: PlanEnd;
  to: PlanEnd;
} {
  return {
    from: row.predecessorTaskId
      ? { kind: "task", id: row.predecessorTaskId }
      : { kind: "milestone", id: row.predecessorMilestoneId ?? "" },
    to: row.successorTaskId
      ? { kind: "task", id: row.successorTaskId }
      : { kind: "milestone", id: row.successorMilestoneId ?? "" },
  };
}
/** True when the timeline already links `from` to `to`. */
export function hasDependency(
  timeline: Timeline | undefined,
  from: PlanEnd,
  to: PlanEnd,
) {
  return !!timeline?.dependencies.some(
    (dep) =>
      dep.from.kind === from.kind &&
      dep.from.id === from.id &&
      dep.to.kind === to.kind &&
      dep.to.id === to.id,
  );
}

/** Runs an inverse call (undo) as a tracked mutation, then refreshes. */
function runInverse(
  client: QueryClient,
  t: TFunction,
  call: () => Promise<unknown>,
) {
  const mutation = client.getMutationCache().build(client, {
    mutationKey: timelineMutationKey,
    mutationFn: call,
    onError: (error) => showToast(t(errorKey(error))),
    onSettled: () => invalidateTimeline(client),
  });
  void mutation.execute(undefined).catch(() => {});
}
const undo = (t: TFunction, run: () => void) => ({
  label: t("actions.undo"),
  run,
});

/** Moves or resizes a bar, or moves a milestone; one undo restores it. */
export function useSetPlan(projectId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = timelineKey(projectId);
  return useMutation({
    mutationKey: timelineMutationKey,
    mutationFn: ({ item, startDate, durationDays }: PlanChange) =>
      sendPlan(item, planVersion(item), startDate, durationDays),
    onMutate: async ({ item, startDate, durationDays }) => {
      const snapshot = await snapshotQueries(client, [key]);
      client.setQueryData<Timeline>(key, (current) =>
        current
          ? applyPlanChange(
              current,
              item.id,
              startDate,
              durationDays,
              shiftsChildren(item),
            )
          : current,
      );
      return snapshot;
    },
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (version, { item, reason }) => {
      showToast(
        t(reason === "resize" ? "timeline.resized" : "timeline.rescheduled", {
          title: item.title,
        }),
        undo(t, () =>
          runInverse(client, t, () =>
            sendPlan(item, version, item.start, Math.max(1, item.durationDays)),
          ),
        ),
      );
    },
    onSettled: () => invalidateTimeline(client),
  });
}

let optimisticSequence = 0;

/** Adds a finish-to-start dependency; a duplicate or a cycle answers 409. */
export function useAddDependency(projectId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = timelineKey(projectId);
  const mutation = useMutation({
    mutationKey: timelineMutationKey,
    mutationFn: async ({ from, to }: { from: PlanEnd; to: PlanEnd }) =>
      dependencySchema.parse(
        await request("/api/dependencies", {
          method: "POST",
          body: JSON.stringify(dependencyBody(from, to)),
        }),
      ),
    onMutate: async ({ from, to }) => {
      const snapshot = await snapshotQueries(client, [key]);
      client.setQueryData<Timeline>(key, (current) =>
        current
          ? {
              ...current,
              dependencies: [
                ...current.dependencies,
                {
                  id: `optimistic:${++optimisticSequence}`,
                  from,
                  to,
                  conflict: false,
                },
              ],
            }
          : current,
      );
      return snapshot;
    },
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(
        error instanceof ApiError && error.status === 409
          ? t("timeline.cycle")
          : t(errorKey(error)),
      );
    },
    onSuccess: (row) => {
      showToast(
        t("timeline.depAdded"),
        undo(t, () =>
          runInverse(client, t, () =>
            request(`/api/dependencies/${row.id}`, { method: "DELETE" }),
          ),
        ),
      );
    },
    onSettled: () => invalidateTimeline(client),
  });
  /** Ignores a self-link and explains a duplicate without a round trip. */
  const add = (from: PlanEnd, to: PlanEnd) => {
    if (from.kind === to.kind && from.id === to.id) return false;
    if (hasDependency(client.getQueryData<Timeline>(key), from, to)) {
      showToast(t("timeline.depExists"));
      return false;
    }
    mutation.mutate({ from, to });
    return true;
  };
  return { ...mutation, add };
}

/** Removes a dependency; undo re-adds it from the returned row. */
export function useRemoveDependency(projectId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = timelineKey(projectId);
  return useMutation({
    mutationKey: timelineMutationKey,
    mutationFn: async (dependency: TimelineDependency) =>
      dependencySchema.parse(
        await request(`/api/dependencies/${dependency.id}`, {
          method: "DELETE",
        }),
      ),
    onMutate: async (dependency) => {
      const snapshot = await snapshotQueries(client, [key]);
      client.setQueryData<Timeline>(key, (current) =>
        current
          ? {
              ...current,
              dependencies: current.dependencies.filter(
                (dep) => dep.id !== dependency.id,
              ),
            }
          : current,
      );
      return snapshot;
    },
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (row) => {
      const { from, to } = dependencyEnds(row);
      showToast(
        t("timeline.depRemoved"),
        undo(t, () =>
          runInverse(client, t, () =>
            request("/api/dependencies", {
              method: "POST",
              body: JSON.stringify(dependencyBody(from, to)),
            }),
          ),
        ),
      );
    },
    onSettled: () => invalidateTimeline(client),
  });
}
