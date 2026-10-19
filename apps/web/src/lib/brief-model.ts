import type { ProjectStage } from "@taff/schemas";
// The brief's display model (M17): pure, deterministic and built only from
// the server's codes, numbers and labels (plan §4.4). Every sentence is an
// i18n key with values; nothing here invents prose, progress or advice.
import type {
  AskAnswer,
  AskItem,
  Brief,
  BriefAction,
  BriefLabels,
  BriefProject,
  Suggestion,
} from "@taff/schemas/assistant";

/** A sentence to translate: a key, and values that may be phrases or dates. */
export type Phrase = {
  key: string;
  values?: Record<string, PhraseValue>;
};
export type PhraseValue = string | number | Phrase | { date: string };

type Named = { id: string; name: string };
export type LabelIndex = {
  workspace(id: string): { name: string; key: string } | undefined;
  project(id: string): string | undefined;
  task(
    id: string | null | undefined,
  ): { title: string; ref: string; projectId: string | null } | undefined;
  milestone(id: string | null): string | undefined;
  agent(id: string | null | undefined): string | undefined;
  member(id: string | null | undefined): string | undefined;
};

export function labelIndex(labels: BriefLabels | undefined): LabelIndex {
  const map = <T extends { id: string }>(rows: T[] | undefined) =>
    new Map((rows ?? []).map((row) => [row.id, row]));
  const workspaces = map(labels?.workspaces);
  const projects = map<Named & { workspaceId: string }>(labels?.projects);
  const tasks = map(labels?.tasks);
  const milestones = map(labels?.milestones);
  const agents = map(labels?.agents);
  const members = map(labels?.members ?? labels?.agents);
  return {
    workspace: (id) => workspaces.get(id),
    project: (id) => projects.get(id)?.name,
    task: (id) => {
      const task = id ? tasks.get(id) : undefined;
      if (!task) return undefined;
      const key = workspaces.get(task.workspaceId)?.key ?? "WS";
      return {
        title: task.title,
        ref: task.number > 0 ? `${key}-${task.number}` : "…",
        projectId: task.projectId,
      };
    },
    milestone: (id) => (id ? milestones.get(id)?.name : undefined),
    agent: (id) => (id ? agents.get(id)?.name : undefined),
    member: (id) => (id ? members.get(id)?.name : undefined),
  };
}

const taskName = (labels: LabelIndex, id: string | null | undefined) =>
  labels.task(id)?.title;

/** Sentences join with a space in English and directly in Chinese. */
export function sentences(parts: string[], locale: string): string {
  return parts.join(locale.startsWith("zh") ? "" : " ");
}

/** Morning before 12:00, afternoon before 18:00, then evening. */
export function greetingPart(
  hour: number,
): "morning" | "afternoon" | "evening" {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** One sentence per risk reason, in the server's order; on track otherwise. */
export function reasonPhrases(
  project: BriefProject,
  labels: LabelIndex,
): Phrase[] {
  const { risk } = project;
  const phrases = risk.reasons.map((reason): Phrase => {
    switch (reason) {
      case "blocked": {
        const task = taskName(labels, risk.blockedTaskId);
        return task
          ? { key: "brief.reason.blockedTask", values: { task } }
          : { key: "timeline.risk.reason.blocked" };
      }
      case "behind": {
        const task = taskName(labels, risk.driverTaskId);
        return task
          ? { key: "brief.reason.behindTask", values: { task } }
          : { key: "timeline.risk.reason.behind" };
      }
      case "slip": {
        const milestone = labels.milestone(risk.lastMilestoneId);
        return milestone
          ? {
              key: "brief.reason.slipMilestone",
              values: { milestone, count: risk.slipDays },
            }
          : { key: "brief.reason.slip", values: { count: risk.slipDays } };
      }
      default:
        return { key: "brief.reason.conflict" };
    }
  });
  if (phrases.length) return phrases;
  return risk.forecastEnd
    ? [
        {
          key: "brief.reason.onTrackFor",
          values: { date: { date: risk.forecastEnd } },
        },
      ]
    : [{ key: "brief.reason.noPlan" }];
}

/** The brief paragraph: on-track share, the worst project, agents, reviews. */
export function briefSummary(brief: Brief, labels: LabelIndex): Phrase[] {
  const { counts } = brief;
  if (!counts.projects) return [{ key: "brief.summary.noProjects" }];
  const phrases: Phrase[] = [
    {
      key: "brief.summary.onTrack",
      values: { count: counts.onTrack, total: counts.projects },
    },
  ];
  const worst = brief.projects[0];
  if (worst && worst.risk.level !== "low")
    phrases.push({
      key: "brief.summary.worst",
      values: {
        project: worst.name,
        reason: reasonPhrases(worst, labels)[0] as Phrase,
      },
    });
  phrases.push(
    counts.agentsWorking
      ? { key: "brief.summary.agents", values: { count: counts.agentsWorking } }
      : { key: "brief.summary.noAgents" },
  );
  if (counts.reviewsWaiting)
    phrases.push({
      key: "brief.summary.reviews",
      values: { count: counts.reviewsWaiting },
    });
  return phrases;
}

/** The three tiles: due today, agents working, waiting for the reader. */
export function briefStats(brief: Brief) {
  return [
    { key: "brief.stat.dueToday", value: brief.counts.dueToday },
    { key: "brief.stat.agents", value: brief.counts.agentsWorking },
    {
      key: "brief.stat.toConfirm",
      value:
        brief.counts.reviewsWaiting +
        brief.counts.pendingGrants +
        brief.counts.pendingSuggestions,
    },
  ];
}

export type PortfolioTotal = {
  currency: string;
  projects: number;
  amount: number;
  collected: number;
  collectedPercent: number | null;
  /** Delivery % weighted by contract amount. */
  deliveryPercent: number;
};

/**
 * Totals over the projects whose finance the reader may see (ADR 0021), one per
 * currency so amounts are never added across currencies.
 */
export function filterBriefProjects(brief: Brief, stage: ProjectStage | null) {
  return stage === null
    ? brief.projects
    : brief.projects.filter((project) => project.stage === stage);
}

export function portfolioTotals(
  brief: Brief,
  stage: ProjectStage | null = null,
): PortfolioTotal[] {
  const totals = new Map<string, PortfolioTotal & { weighted: number }>();
  for (const project of filterBriefProjects(brief, stage)) {
    const finance = project.risk.finance;
    if (!finance?.contractAmount || !finance.currency) continue;
    const amount = Number(finance.contractAmount);
    const total = totals.get(finance.currency) ?? {
      currency: finance.currency,
      projects: 0,
      amount: 0,
      collected: 0,
      collectedPercent: null,
      deliveryPercent: 0,
      weighted: 0,
    };
    total.projects += 1;
    total.amount += amount;
    total.collected += Number(finance.collectedAmount);
    total.weighted += amount * project.risk.deliveryPercent;
    totals.set(finance.currency, total);
  }
  return [...totals.values()]
    .sort((a, b) => (a.currency < b.currency ? -1 : 1))
    .map(({ weighted, ...total }) => ({
      ...total,
      collectedPercent:
        total.amount > 0
          ? Math.round((total.collected / total.amount) * 100)
          : null,
      deliveryPercent:
        total.amount > 0 ? Math.round(weighted / total.amount) : 0,
    }));
}

export type ActionView = {
  key: string;
  action: BriefAction;
  title: Phrase;
  /** Where the decision is made: the review workspace, the task or agent. */
  href: string | null;
  linkKey: string;
};

/**
 * Each action points at the place where a person decides. A review opens
 * the review workspace and a grant the task (or agent) with the existing
 * grant controls; a suggestion opens its proposal sheet in the brief.
 */
export function actionViews(
  brief: Brief,
  labels: LabelIndex,
  suggestions: Map<string, Suggestion>,
): ActionView[] {
  return brief.actions.map((action): ActionView => {
    const agent =
      action.kind === "suggestion"
        ? (labels.member(action.proposerId ?? action.agentId) ?? {
            key: "brief.proposal.someone",
          })
        : (labels.agent(action.agentId) ?? { key: "agent" });
    const task = taskName(labels, action.taskId) ?? {
      key: "brief.someTask",
    };
    if (action.kind === "review")
      return {
        key: `review:${action.runId}`,
        action,
        title: { key: "brief.action.review", values: { agent, task } },
        href: `/tasks/${action.taskId}/review`,
        linkKey: "brief.action.openReview",
      };
    if (action.kind === "grant")
      return {
        key: `grant:${action.grantId}`,
        action,
        title: {
          key: action.taskId ? "brief.action.grantTask" : "brief.action.grant",
          values: {
            agent,
            task,
            capability: {
              key: `agentProfile.capability.${action.capability}`,
            },
          },
        },
        href: action.taskId
          ? `/tasks/${action.taskId}`
          : `/agents/${action.agentId}`,
        linkKey: "brief.action.openGrant",
      };
    const suggestion = suggestions.get(action.suggestionId);
    return {
      key: `suggestion:${action.suggestionId}`,
      action,
      title:
        suggestion?.kind === "split"
          ? {
              key: "brief.action.split",
              values: {
                agent,
                task,
                count: suggestion.payload.subtasks.length,
              },
            }
          : suggestion?.kind === "reschedule"
            ? {
                key: "brief.action.reschedule",
                values: {
                  agent,
                  task,
                  date: { date: suggestion.payload.startDate },
                  count: suggestion.payload.durationDays,
                },
              }
            : { key: "brief.action.proposal", values: { agent, task } },
      href: null,
      linkKey: "brief.action.openProposal",
    };
  });
}

export type AnswerItemView = {
  key: string;
  item: AskItem;
  title: Phrase;
  detail: Phrase | null;
  href: string | null;
};

/** Ask taff's structured answer as a heading and linked items. */
export function answerView(answer: AskAnswer): {
  heading: Phrase;
  items: AnswerItemView[];
} {
  const labels = labelIndex(answer.labels);
  const count = answer.items.length;
  const heading: Phrase =
    answer.intent === "unknown"
      ? { key: "ask.answer.unknown" }
      : count
        ? { key: `ask.answer.${answer.intent}`, values: { count } }
        : { key: `ask.answer.none.${answer.intent}` };
  const items = answer.items.map((item, index): AnswerItemView => {
    const agent =
      item.kind === "suggestion"
        ? (labels.member(item.proposerId ?? item.agentId) ?? {
            key: "brief.proposal.someone",
          })
        : (labels.agent(item.agentId) ?? { key: "agent" });
    const task = taskName(labels, item.taskId) ?? { key: "brief.someTask" };
    const key = `${item.kind}:${item.id}:${index}`;
    switch (item.kind) {
      case "project":
        return {
          key,
          item,
          title: {
            key: "ask.item.project",
            values: {
              project: labels.project(item.id) ?? "—",
              level: { key: `timeline.risk.level.${item.level ?? "low"}` },
            },
          },
          detail: item.forecastEnd
            ? item.slipDays
              ? {
                  key: "ask.item.forecastLate",
                  values: {
                    date: { date: item.forecastEnd },
                    count: item.slipDays,
                  },
                }
              : {
                  key: "ask.item.forecast",
                  values: { date: { date: item.forecastEnd } },
                }
            : null,
          href: `/projects/${item.id}?view=timeline`,
        };
      case "task":
        return {
          key,
          item,
          title: { key: "ask.item.task", values: { task } },
          detail: item.dueDate
            ? { key: "ask.item.due", values: { date: { date: item.dueDate } } }
            : null,
          href: item.taskId ? `/tasks/${item.taskId}` : null,
        };
      case "review":
        return {
          key,
          item,
          title: { key: "brief.action.review", values: { agent, task } },
          detail: null,
          href: item.taskId ? `/tasks/${item.taskId}/review` : null,
        };
      case "grant":
        return {
          key,
          item,
          title: item.taskId
            ? { key: "ask.item.blockedTask", values: { agent, task } }
            : { key: "ask.item.blockedAgent", values: { agent } },
          detail: null,
          href: item.taskId
            ? `/tasks/${item.taskId}`
            : item.agentId
              ? `/agents/${item.agentId}`
              : null,
        };
      case "suggestion":
        return {
          key,
          item,
          title: { key: "brief.action.proposal", values: { agent, task } },
          detail: null,
          href: item.taskId ? `/tasks/${item.taskId}` : null,
        };
      default:
        return {
          key,
          item,
          title: {
            key: "ask.item.agent",
            values: {
              agent,
              task,
              status: { key: `run.status.${item.status ?? "running"}` },
            },
          },
          detail: null,
          href: item.agentId ? `/agents/${item.agentId}` : null,
        };
    }
  });
  return { heading, items };
}
