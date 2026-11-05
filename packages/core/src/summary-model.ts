import { createHash } from "node:crypto";
import type {
  AudienceKind,
  DailySummarySnapshot,
  ProjectStage,
  SummaryProject,
  SummaryTaskItem,
  SummaryWatermark,
  TaskStatus,
} from "@taff/schemas";
import { buildPlanModel, type PlanModelInput } from "./plan-model";
import { canonicalJson } from "./trusted-review";

/**
 * The shareholder daily summary (ADR 0027). A pure function like
 * `buildBrief`: core loads rows, this derives the snapshot. Each project's
 * risk is exactly `buildPlanModel(plan).risk`, so a shareholder sees the
 * numbers the team sees on the timeline. Codes and numbers only; the web
 * writes the sentences in the reader's language and zone.
 */
export type SummarySourceTask = {
  taskId: string;
  number: number;
  title: string;
  status: TaskStatus;
  ownerName: string | null;
  dueAt: string | null;
  /** Civil due date in the recipient's zone. */
  dueDate: string | null;
  /** Civil date of the task's last change in the recipient's zone. */
  changedOn: string;
  blocked: boolean;
};
export type SummarySourceProject = {
  projectId: string;
  name: string;
  stage: ProjectStage | null;
  leadName: string | null;
  dueAt: string | null;
  deliveryProgress: number;
  plan: PlanModelInput;
  tasks: SummarySourceTask[];
  agentRuns: { completedToday: number; pendingReview: number };
};
export type SummarySource = {
  localDate: string;
  timeZone: string;
  workspaceName: string;
  tag: { kind: AudienceKind; org: string; label: string };
  recipient: { name: string; includeFinance: boolean; showPeople: boolean };
  projects: SummarySourceProject[];
};

export const SUMMARY_ITEM_LIMIT = 20;
export const SUMMARY_PROJECT_LIMIT = 100;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byDue = (a: SummarySourceTask, b: SummarySourceTask) =>
  byText(a.dueAt ?? "", b.dueAt ?? "") || a.number - b.number;

export function buildDailySummary(source: SummarySource): DailySummarySnapshot {
  const day = source.localDate;
  const { includeFinance, showPeople } = source.recipient;
  let truncated = source.projects.length > SUMMARY_PROJECT_LIMIT;
  const cap = (list: SummarySourceTask[]): SummaryTaskItem[] => {
    if (list.length > SUMMARY_ITEM_LIMIT) truncated = true;
    return list.slice(0, SUMMARY_ITEM_LIMIT).map((task) => ({
      taskId: task.taskId,
      number: task.number,
      title: task.title,
      status: task.status,
      ownerName: showPeople ? task.ownerName : null,
      dueAt: task.dueAt,
    }));
  };
  const projects = [...source.projects]
    .sort((a, b) => byText(a.name, b.name) || byText(a.projectId, b.projectId))
    .slice(0, SUMMARY_PROJECT_LIMIT)
    .map((project): SummaryProject => {
      const risk = buildPlanModel({ ...project.plan, today: day }).risk;
      const tasks = [...project.tasks].sort((a, b) => a.number - b.number);
      const open = tasks.filter((task) => task.status !== "done");
      const done = tasks.filter((task) => task.status === "done");
      const completedToday = done.filter((task) => task.changedOn === day);
      const movedToday = open.filter((task) => task.changedOn === day);
      const dueToday = open.filter((task) => task.dueDate === day).sort(byDue);
      const overdue = open
        .filter((task) => task.dueDate !== null && task.dueDate < day)
        .sort(byDue);
      const blocked = open.filter((task) => task.blocked);
      return {
        projectId: project.projectId,
        name: project.name,
        stage: project.stage,
        leadName: showPeople ? project.leadName : null,
        dueAt: project.dueAt,
        deliveryProgress: project.deliveryProgress,
        risk: {
          level: risk.level,
          reasons: risk.reasons,
          plannedEnd: risk.plannedEnd,
          forecastEnd: risk.forecastEnd,
          slipDays: risk.slipDays,
          deliveryPercent: risk.deliveryPercent,
        },
        finance:
          includeFinance && risk.finance
            ? {
                currency: risk.finance.currency,
                contractAmount: risk.finance.contractAmount,
                collectedAmount: risk.finance.collectedAmount,
                collectedPercent: risk.finance.collectedPercent,
              }
            : null,
        counts: {
          total: tasks.length,
          open: open.length,
          done: done.length,
          inReview: open.filter((task) => task.status === "needs_review")
            .length,
          blocked: blocked.length,
          dueToday: dueToday.length,
          overdue: overdue.length,
          completedToday: completedToday.length,
          movedToday: movedToday.length,
        },
        agentRuns: {
          completedToday: project.agentRuns.completedToday,
          pendingReview: project.agentRuns.pendingReview,
        },
        completedToday: cap(completedToday),
        movedToday: cap(movedToday),
        dueToday: cap(dueToday),
        overdue: cap(overdue),
        blocked: cap(blocked),
      };
    });
  const sum = (key: keyof SummaryProject["counts"]) =>
    projects.reduce((total, project) => total + project.counts[key], 0);
  return {
    version: 1,
    localDate: day,
    timeZone: source.timeZone,
    workspace: { name: source.workspaceName },
    tag: { ...source.tag },
    recipient: { name: source.recipient.name },
    projects,
    totals: {
      projects: projects.length,
      open: sum("open"),
      inReview: sum("inReview"),
      blocked: sum("blocked"),
      dueToday: sum("dueToday"),
      overdue: sum("overdue"),
      completedToday: sum("completedToday"),
      movedToday: sum("movedToday"),
    },
    truncated,
  };
}

/** sha256 of the canonical JSON; printed on every rendered copy. */
export function summaryContentHash(snapshot: DailySummarySnapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

/** The recipient-bound watermark, fixed when the row is written. */
export function summaryWatermark(
  snapshot: DailySummarySnapshot,
  summaryId: string | null,
  contentHash = summaryContentHash(snapshot),
): SummaryWatermark {
  const reference = summaryId ? summaryId.slice(0, 8) : "preview";
  return {
    text: [
      snapshot.recipient.name,
      snapshot.tag.org,
      snapshot.localDate,
      reference,
    ].join(" · "),
    recipientName: snapshot.recipient.name,
    org: snapshot.tag.org,
    localDate: snapshot.localDate,
    summaryId,
    contentHash,
  };
}
