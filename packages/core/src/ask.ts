import type { AskIntent, AskItem, Brief } from "@taff/schemas";
import type { BriefSource } from "./brief";
import { civilDate, dayNumber } from "./plan-model";

/**
 * Ask taff's rules fallback (plan §4.4). It ports the concept of the
 * prototype's canned router: a question maps to an intent, and the answer is
 * structured items (codes, ids, numbers) from the same brief data, never
 * invented prose. English, Traditional and Simplified Chinese phrasings.
 */
const INTENTS: [AskIntent, RegExp][] = [
  ["blocked", /block|stuck|阻|卡住|卡關|卡关|等授權|等授权/i],
  [
    "needs_me",
    /needs? (me|my)|for me|waiting (on|for) me|my (review|approval|decision)|approve|需要我|等我|待我|我要|我需要|待確認|待确认|審批|审批/i,
  ],
  [
    "agent_status",
    /\bagents?\b|\bbots?\b|智能體|智能体|機械人|机器人|做甚麼|做什么|做緊/i,
  ],
  [
    "due_this_week",
    /this week|due|deadline|本週|本周|這週|这周|今週|呢個禮拜|到期|截止/i,
  ],
  [
    "at_risk",
    /risk|late|slip|delay|behind|on track|release|風險|风险|延誤|延误|延遲|延迟|落後|落后|進度|进度|發佈|发布/i,
  ],
];

export function askIntent(question: string): AskIntent {
  return (
    INTENTS.find(([, pattern]) => pattern.test(question))?.[0] ?? "unknown"
  );
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function answerAsk(
  question: string,
  source: BriefSource,
  brief: Brief,
): { intent: AskIntent; items: AskItem[] } {
  const intent = askIntent(question);
  switch (intent) {
    case "at_risk":
      return {
        intent,
        items: brief.projects
          .filter((project) => project.risk.level !== "low")
          .map((project) => ({
            kind: "project",
            workspaceId: project.workspaceId,
            id: project.projectId,
            projectId: project.projectId,
            level: project.risk.level,
            reasons: project.risk.reasons,
            slipDays: project.risk.slipDays,
            forecastEnd: project.risk.forecastEnd,
          })),
      };
    case "blocked":
      // A task is blocked while a permission grant for it is pending (M12).
      return {
        intent,
        items: source.pendingGrants.map((grant) => ({
          kind: "grant",
          workspaceId: grant.workspaceId,
          id: grant.grantId,
          taskId: grant.taskId,
          agentId: grant.agentId,
        })),
      };
    case "needs_me":
      return {
        intent,
        items: brief.actions.map((action): AskItem => {
          if (action.kind === "review")
            return {
              kind: "review",
              workspaceId: action.workspaceId,
              id: action.runId,
              runId: action.runId,
              taskId: action.taskId,
              agentId: action.agentId,
            };
          if (action.kind === "grant")
            return {
              kind: "grant",
              workspaceId: action.workspaceId,
              id: action.grantId,
              taskId: action.taskId,
              agentId: action.agentId,
            };
          return {
            kind: "suggestion",
            workspaceId: action.workspaceId,
            id: action.suggestionId,
            taskId: action.taskId,
            agentId: action.agentId,
          };
        }),
      };
    case "due_this_week": {
      const last = civilDate(dayNumber(source.today) + 6);
      return {
        intent,
        items: source.myTasks
          .filter(
            (task) =>
              task.status !== "done" &&
              task.dueDate !== null &&
              task.dueDate >= source.today &&
              task.dueDate <= last,
          )
          .sort(
            (a, b) =>
              byText(a.dueDate as string, b.dueDate as string) ||
              byText(a.taskId, b.taskId),
          )
          .map((task) => ({
            kind: "task",
            workspaceId: task.workspaceId,
            id: task.taskId,
            taskId: task.taskId,
            projectId: task.projectId,
            dueDate: task.dueDate as string,
            status: task.status,
          })),
      };
    }
    case "agent_status":
      return {
        intent,
        items: [...source.agentRuns]
          .sort(
            (a, b) =>
              byText(a.workspaceId, b.workspaceId) ||
              byText(a.agentId, b.agentId) ||
              byText(a.runId, b.runId),
          )
          .map((run) => ({
            kind: "agent",
            workspaceId: run.workspaceId,
            id: run.agentId,
            agentId: run.agentId,
            runId: run.runId,
            taskId: run.taskId,
            status: run.status,
          })),
      };
    default:
      return { intent: "unknown", items: [] };
  }
}
