"use client";
// Prototype v2 brief and Ask taff, Team Tasks Module Plan.dc.html lines
// 240–285 (layout) and 626–646 (Ask). Ported without the prototype's fake
// intelligence (plan §2.4 item 12): every sentence comes from the server's
// codes and numbers, actions open the place where a person decides, and Ask
// answers from rules unless an admin opted a workspace into a model (D6).
import "../styles/brief.css";

import type { Locale } from "@taff/schemas";
import type {
  AskAnswer,
  Brief,
  BriefProject,
  Suggestion,
} from "@taff/schemas/assistant";
import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import {
  type ActionView,
  actionViews,
  answerView,
  briefStats,
  briefSummary,
  greetingPart,
  type LabelIndex,
  labelIndex,
  type Phrase,
  type PhraseValue,
  portfolioTotals,
  reasonPhrases,
  sentences,
} from "../lib/brief-model";
import {
  useAsk,
  useBrief,
  useDecideSuggestion,
  usePendingSuggestions,
} from "../lib/brief-queries";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

const TRY = ["atRisk", "needsMe", "blocked", "dueThisWeek", "agents"] as const;

/** Translates a phrase, formatting nested phrases and civil dates. */
function useSay() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? "en") as Locale;
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const date = (value: string) =>
      short.format(new Date(`${value}T00:00:00Z`));
    const say = (phrase: Phrase): string =>
      t(phrase.key, {
        nsSeparator: false,
        ...Object.fromEntries(
          Object.entries(phrase.values ?? {}).map(
            ([name, value]: [string, PhraseValue]) => [
              name,
              typeof value === "string" || typeof value === "number"
                ? value
                : "date" in value
                  ? date(value.date)
                  : say(value),
            ],
          ),
        ),
      });
    return { say, date, locale, t };
  }, [t, locale]);
}

/** The reader's hour in the brief's time zone, for the greeting. */
function hourIn(timeZone: string) {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone,
      }).format(new Date()),
    );
  } catch {
    return new Date().getHours();
  }
}

export function BriefView({
  onClose,
  headingId,
  as: Heading = "h2",
}: {
  onClose: () => void;
  /** The overlay names its dialog with the greeting. */
  headingId?: string;
  as?: "h1" | "h2";
}) {
  const { me } = useWorkspace();
  const { say, t, locale } = useSay();
  const brief = useBrief();
  const fallbackId = useId();
  const greetingId = headingId ?? fallbackId;
  const eyebrowDate = brief.data
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${brief.data.today}T00:00:00Z`))
    : null;
  const ask = useAsk();
  return (
    <div className="brief" data-testid="brief-view">
      <div className="brief-head">
        <p className="brief-eyebrow">
          <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {t("brief.title")}
            {eyebrowDate && ` · ${eyebrowDate}`}
          </span>
        </p>
        <button
          type="button"
          className="brief-icon-button"
          aria-label={t("brief.close")}
          data-testid="brief-close"
          onClick={onClose}
        >
          <X size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <AskForm ask={ask} />
      </div>
      <AskResult ask={ask} />
      {brief.isPending ? (
        <p className="brief-note" aria-live="polite">
          {t("brief.loading")}
        </p>
      ) : brief.error ? (
        <p className="brief-note" role="alert">
          {t(errorKey(brief.error))}
        </p>
      ) : (
        <BriefBody
          brief={brief.data}
          name={me.user.name}
          greetingId={greetingId}
          Heading={Heading}
          say={say}
          onAsk={(question) => ask.mutate(question)}
        />
      )}
    </div>
  );
}

function BriefBody({
  brief,
  name,
  greetingId,
  Heading,
  say,
  onAsk,
}: {
  brief: Brief;
  name: string;
  greetingId: string;
  Heading: "h1" | "h2";
  say: (phrase: Phrase) => string;
  onAsk: (question: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? "en") as Locale;
  const numbers = new Intl.NumberFormat(locale);
  const labels = useMemo(() => labelIndex(brief.labels), [brief.labels]);
  const summary = sentences(briefSummary(brief, labels).map(say), locale);
  const Sub = Heading === "h1" ? "h2" : "h3";
  return (
    <>
      <section className="brief-section" aria-labelledby={greetingId}>
        <Heading
          id={greetingId}
          className="brief-greeting"
          data-testid="brief-greeting"
        >
          {t(`brief.greeting.${greetingPart(hourIn(brief.timeZone))}`, {
            name,
          })}
        </Heading>
        <p className="brief-text" data-testid="brief-text">
          {summary}
        </p>
        <dl
          className="brief-stats"
          aria-label={t("brief.stats")}
          data-testid="brief-stats"
        >
          {briefStats(brief).map((stat) => (
            <div key={stat.key} className="brief-stat">
              <dt>{t(stat.key)}</dt>
              <dd data-testid={`brief-stat-${stat.key.split(".").at(-1)}`}>
                {numbers.format(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="brief-try">
          <span className="brief-try-label" aria-hidden="true">
            {t("ask.try")}
          </span>
          <ul aria-label={t("ask.try")}>
            {TRY.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  className="brief-chip"
                  data-testid={`ask-try-${key}`}
                  onClick={() => onAsk(t(`ask.suggestion.${key}`))}
                >
                  {t(`ask.suggestion.${key}`)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <RiskSection
        brief={brief}
        labels={labels}
        say={say}
        locale={locale}
        Sub={Sub}
      />
      <ActionsSection brief={brief} labels={labels} say={say} Sub={Sub} />
      <p className="brief-source">{t("brief.source")}</p>
    </>
  );
}

function money(locale: Locale, currency: string, amount: number) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(amount);
}

function FinanceCells({
  amount,
  collected,
  collectedPercent,
  deliveryPercent,
  currency,
  locale,
}: {
  amount: number | null;
  collected: number | null;
  collectedPercent: number | null;
  deliveryPercent: number;
  currency: string | null;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  return (
    <dl className="brief-finance">
      {amount !== null && currency && (
        <div>
          <dt>{t("timeline.finance.amount")}</dt>
          <dd>{money(locale, currency, amount)}</dd>
        </div>
      )}
      {collected !== null && currency && (
        <div>
          <dt>{t("timeline.finance.collected")}</dt>
          <dd>
            {money(locale, currency, collected)}
            {collectedPercent !== null && (
              <span className="brief-finance-sub">
                {percent.format(collectedPercent / 100)}
              </span>
            )}
          </dd>
          {collectedPercent !== null && <Bar percent={collectedPercent} />}
        </div>
      )}
      <div>
        <dt>{t("brief.finance.delivery")}</dt>
        <dd>{percent.format(deliveryPercent / 100)}</dd>
        <Bar percent={deliveryPercent} />
      </div>
    </dl>
  );
}

function Bar({ percent }: { percent: number }) {
  return (
    <span className="brief-bar" aria-hidden="true">
      <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </span>
  );
}

function RiskSection({
  brief,
  labels,
  say,
  locale,
  Sub,
}: {
  brief: Brief;
  labels: LabelIndex;
  say: (phrase: Phrase) => string;
  locale: Locale;
  Sub: "h2" | "h3";
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const totals = portfolioTotals(brief);
  if (!brief.projects.length) return null;
  return (
    <section
      className="brief-section"
      aria-labelledby={headingId}
      data-testid="brief-risks"
    >
      <Sub id={headingId} className="brief-label">
        {t("brief.risk.title")}
      </Sub>
      {totals.map((total) => (
        <div
          key={total.currency}
          className="brief-portfolio"
          data-testid="brief-portfolio"
        >
          <p className="brief-portfolio-label">
            {t("brief.finance.total", { count: total.projects })}
          </p>
          <FinanceCells
            amount={total.amount}
            collected={total.collected}
            collectedPercent={total.collectedPercent}
            deliveryPercent={total.deliveryPercent}
            currency={total.currency}
            locale={locale}
          />
        </div>
      ))}
      <ul className="brief-risk-list">
        {brief.projects.map((project) => (
          <RiskRow
            key={project.projectId}
            project={project}
            labels={labels}
            say={say}
            locale={locale}
          />
        ))}
      </ul>
    </section>
  );
}

/** Opening a record of another organization switches to it first. */
function useSwitchTo() {
  const { workspace, setWorkspaceId } = useWorkspace();
  return (workspaceId: string) => {
    if (workspaceId !== workspace.id) setWorkspaceId(workspaceId);
  };
}

function RiskRow({
  project,
  labels,
  say,
  locale,
}: {
  project: BriefProject;
  labels: LabelIndex;
  say: (phrase: Phrase) => string;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const switchTo = useSwitchTo();
  const { risk } = project;
  const finance = risk.finance;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  return (
    <li>
      <Link
        className="brief-risk"
        href={`/projects/${project.projectId}?view=timeline`}
        prefetch={false}
        data-testid="brief-risk"
        data-project={project.projectId}
        data-level={risk.level}
        aria-label={`${t("brief.risk.openTimeline", { project: project.name })}. ${t(`timeline.risk.level.${risk.level}`)}`}
        onClick={() => switchTo(project.workspaceId)}
      >
        <span className="brief-risk-head">
          <span className="brief-risk-names">
            <span className="brief-risk-org">
              {labels.workspace(project.workspaceId)?.name}
            </span>
            <span className="brief-risk-name">{project.name}</span>
          </span>
          <span className={`brief-level is-${risk.level}`}>
            {t(`timeline.risk.level.${risk.level}`)}
          </span>
        </span>
        <span className="brief-risk-reason" data-testid="brief-risk-reason">
          {sentences(reasonPhrases(project, labels).map(say), locale)}
        </span>
        <FinanceCells
          amount={
            finance?.contractAmount ? Number(finance.contractAmount) : null
          }
          collected={
            finance?.contractAmount ? Number(finance.collectedAmount) : null
          }
          collectedPercent={finance?.collectedPercent ?? null}
          deliveryPercent={risk.deliveryPercent}
          currency={finance?.currency ?? null}
          locale={locale}
        />
        {risk.forecastEnd && (
          <span className="brief-risk-meta">
            {risk.slipDays
              ? t("brief.risk.forecastLate", {
                  date: date(risk.forecastEnd),
                  count: risk.slipDays,
                })
              : t("brief.risk.forecast", { date: date(risk.forecastEnd) })}
          </span>
        )}
      </Link>
    </li>
  );
}

function ActionsSection({
  brief,
  labels,
  say,
  Sub,
}: {
  brief: Brief;
  labels: LabelIndex;
  say: (phrase: Phrase) => string;
  Sub: "h2" | "h3";
}) {
  const { t } = useTranslation();
  const undo = useDecideSuggestion();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const switchTo = useSwitchTo();
  const workspaceIds = [
    ...new Set(
      brief.actions
        .filter((action) => action.kind === "suggestion")
        .map((action) => action.workspaceId),
    ),
  ];
  const suggestions = usePendingSuggestions(workspaceIds);
  const views = actionViews(brief, labels, suggestions);
  const [open, setOpen] = useState<ActionView | null>(null);
  return (
    <section
      className="brief-section"
      aria-labelledby={headingId}
      data-testid="brief-actions"
    >
      <Sub
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="brief-label"
      >
        {t("brief.actions.title")}
      </Sub>
      {views.length === 0 ? (
        <p className="brief-empty">{t("brief.actions.none")}</p>
      ) : (
        <ul className="brief-action-list">
          {views.map((view) => (
            <li
              key={view.key}
              className="brief-action"
              data-testid="brief-action"
              data-kind={view.action.kind}
            >
              <span className="brief-action-meta">
                <Sparkles size={12} strokeWidth={1.5} aria-hidden="true" />
                {t(`brief.kind.${view.action.kind}`)}
                {view.action.taskId && labels.task(view.action.taskId) && (
                  <span className="brief-action-ref">
                    {labels.task(view.action.taskId)?.ref}
                  </span>
                )}
              </span>
              <span className="brief-action-title">{say(view.title)}</span>
              {view.href ? (
                <Link
                  className="button brief-outline"
                  href={view.href}
                  prefetch={false}
                  data-testid="brief-action-open"
                  onClick={() => switchTo(view.action.workspaceId)}
                >
                  {t(view.linkKey)}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ) : (
                <Button
                  type="button"
                  className="brief-outline"
                  data-testid="brief-action-open"
                  onClick={() => setOpen(view)}
                >
                  {t(view.linkKey)}
                  <ArrowRight size={14} aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open?.action.kind === "suggestion" && (
        <ProposalSheet
          view={open}
          suggestion={suggestions.get(open.action.suggestionId) ?? null}
          labels={labels}
          onApplied={(saved) =>
            showToast(t("brief.toast.applied"), {
              label: t("actions.undo"),
              run: () =>
                undo.mutate(
                  { suggestion: saved, decision: "undo" },
                  {
                    onSuccess: () => showToast(t("brief.toast.undone")),
                    onError: (error) => showToast(t(errorKey(error))),
                  },
                ),
            })
          }
          onClose={() => setOpen(null)}
          onDecided={() => {
            setOpen(null);
            // The decided row leaves the list; keep focus in the section.
            requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      )}
    </section>
  );
}

/**
 * The proposal and exactly what applying it changes. Applying runs the
 * normal create or plan path on the server; nothing changes before that.
 */
function ProposalSheet({
  view,
  suggestion,
  labels,
  onClose,
  onDecided,
  onApplied,
}: {
  view: ActionView;
  suggestion: Suggestion | null;
  labels: LabelIndex;
  onClose: () => void;
  onDecided: () => void;
  onApplied: (saved: Suggestion) => void;
}) {
  const { t, say, date } = useSay();
  const decide = useDecideSuggestion();
  const action = view.action;
  const proposer =
    action.kind === "suggestion"
      ? (labels.member(action.proposerId ?? action.agentId) ??
        t("brief.proposal.someone"))
      : (labels.agent(action.agentId) ?? t("agent"));
  const task = labels.task(action.taskId)?.title ?? t("brief.someTask");
  const run = (decision: "apply" | "dismiss") => {
    if (!suggestion) return;
    decide.mutate(
      { suggestion, decision },
      {
        onSuccess: (saved) => {
          if (decision === "apply") onApplied(saved);
          else showToast(t("brief.toast.dismissed"));
          onDecided();
        },
      },
    );
  };
  return (
    <SheetDialog
      title={t("brief.proposal.title")}
      className="brief-proposal"
      onClose={onClose}
    >
      <p className="brief-proposal-title">{say(view.title)}</p>
      <p className="brief-note-inline">
        {t("brief.proposal.intro", { proposer })}
      </p>
      {!suggestion ? (
        <p aria-live="polite">{t("brief.proposal.loading")}</p>
      ) : suggestion.status !== "pending" ? (
        <p role="status">{t("brief.proposal.gone")}</p>
      ) : suggestion.kind === "split" ? (
        <Detail title={t("brief.proposal.subtasks", { task })}>
          <ol
            className="brief-proposal-list"
            data-testid="brief-proposal-subtasks"
          >
            {suggestion.payload.subtasks.map((item, index) => (
              // Proposed subtasks have no ids; the order is the payload's.
              <li key={index}>
                {item.title}
                {item.dueAt && (
                  <span className="brief-finance-sub">
                    {t("brief.proposal.due", {
                      date: date(item.dueAt.slice(0, 10)),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Detail>
      ) : (
        <Detail title={t("brief.proposal.newPlan", { task })}>
          <dl className="brief-proposal-plan">
            <div>
              <dt>{t("brief.proposal.start")}</dt>
              <dd>{date(suggestion.payload.startDate)}</dd>
            </div>
            <div>
              <dt>{t("brief.proposal.duration")}</dt>
              <dd>
                {t("brief.proposal.days", {
                  count: suggestion.payload.durationDays,
                })}
              </dd>
            </div>
          </dl>
        </Detail>
      )}
      {suggestion?.payload.reason && (
        <Detail title={t("brief.proposal.reason")}>
          <blockquote className="brief-proposal-reason">
            {suggestion.payload.reason}
          </blockquote>
        </Detail>
      )}
      {decide.error && (
        <p className="alert" role="alert">
          {t(errorKey(decide.error))}
        </p>
      )}
      <div className="action-row">
        <Button
          type="button"
          className="button-primary"
          data-testid="brief-proposal-apply"
          disabled={
            !suggestion || suggestion.status !== "pending" || decide.isPending
          }
          onClick={() => run("apply")}
        >
          {t("brief.proposal.apply")}
        </Button>
        <Button
          type="button"
          className="brief-outline"
          data-testid="brief-proposal-dismiss"
          disabled={
            !suggestion || suggestion.status !== "pending" || decide.isPending
          }
          onClick={() => run("dismiss")}
        >
          {t("brief.proposal.dismiss")}
        </Button>
      </div>
    </SheetDialog>
  );
}

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="brief-proposal-detail">
      <h3 className="brief-label">{title}</h3>
      {children}
    </div>
  );
}

type AskState = ReturnType<typeof useAsk>;

function AskForm({ ask }: { ask: AskState }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const inputId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || ask.isPending) return;
    ask.mutate(value);
    setQuestion("");
  };
  return (
    <form className="brief-ask" role="search" onSubmit={submit}>
      <label htmlFor={inputId} className="sr-only">
        {t("ask.label")}
      </label>
      <input
        id={inputId}
        value={question}
        maxLength={500}
        placeholder={t("ask.placeholder")}
        autoComplete="off"
        data-testid="ask-input"
        onChange={(event) => setQuestion(event.target.value)}
      />
      <button
        type="submit"
        className="brief-ask-send"
        aria-label={t("ask.send")}
        data-testid="ask-send"
        disabled={ask.isPending}
      >
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}

/** The answer region: always mounted so screen readers hear each answer. */
function AskResult({ ask }: { ask: AskState }) {
  const { t, say } = useSay();
  const switchTo = useSwitchTo();
  const answer: AskAnswer | undefined = ask.data;
  const view = answer ? answerView(answer) : null;
  return (
    <div
      className="brief-answer-region"
      aria-live="polite"
      aria-busy={ask.isPending}
      data-testid="ask-answer"
    >
      {ask.isPending ? (
        <p className="brief-answer">{t("ask.thinking")}</p>
      ) : ask.error ? (
        <p className="brief-answer" role="alert">
          {t(errorKey(ask.error))}
        </p>
      ) : answer && view ? (
        <div className="brief-answer" data-intent={answer.intent}>
          <p className="brief-answer-question">
            {t("ask.question", { question: ask.variables })}
          </p>
          {answer.text && (
            <p className="brief-answer-text" data-testid="ask-text">
              {answer.text}
            </p>
          )}
          <p className="brief-answer-heading" data-testid="ask-heading">
            {say(view.heading)}
          </p>
          {view.items.length > 0 && (
            <ul className="brief-answer-items">
              {view.items.map((item) => (
                <li key={item.key} data-testid="ask-item">
                  {item.href ? (
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={() => switchTo(item.item.workspaceId)}
                    >
                      {say(item.title)}
                    </Link>
                  ) : (
                    <span>{say(item.title)}</span>
                  )}
                  {item.detail && (
                    <span className="brief-answer-detail">
                      {say(item.detail)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="brief-answer-source" data-source={answer.source}>
            {t(answer.source === "model" ? "ask.model" : "ask.rules")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
