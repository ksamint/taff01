import "../styles/summaries.css";
import {
  calendarWallToInstant,
  type DailySummarySnapshot,
  type SummaryTaskItem,
  type SummaryWatermark,
} from "@taff/schemas";
import type { ReactNode } from "react";

/**
 * One shareholder summary (ADR 0027). Presentational only: no hooks and no
 * client state, so the in-app pages (react-i18next) and the server-rendered
 * public link page (a fixed i18next translator) render the same markup.
 * Dates and numbers use the given locale and the summary's own zone.
 */
export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;
export type SummaryDocumentProps = {
  snapshot: DailySummarySnapshot;
  watermark: SummaryWatermark;
  contentHash: string;
  /** Generation instant; a preview has none. */
  createdAt: string | null;
  locale: string;
  t: Translate;
  /** Links tasks inside the app; the public page shows plain text. */
  taskHref?: (taskId: string) => string;
  actions?: ReactNode;
};

const LISTS = [
  "completedToday",
  "movedToday",
  "dueToday",
  "overdue",
  "blocked",
] as const;

export function WatermarkLayer({ text }: { text: string }) {
  return (
    <div
      className="summary-watermark"
      aria-hidden="true"
      data-testid="summary-watermark"
      data-text={text}
    >
      <div className="summary-watermark-grid">
        {Array.from({ length: 48 }, (_, index) => (
          <span key={index}>{text}</span>
        ))}
      </div>
    </div>
  );
}

export function SummaryDocument({
  snapshot,
  watermark,
  contentHash,
  createdAt,
  locale,
  t,
  taskHref,
  actions,
}: SummaryDocumentProps) {
  const zone = snapshot.timeZone;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const percent = (value: number) =>
    new Intl.NumberFormat(locale, { style: "percent" }).format(value / 100);
  const civil = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  const instant = (iso: string, withTime = false) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
      timeZone: zone,
    }).format(new Date(iso));
  const money = (amount: string, currency: string | null) =>
    currency
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(Number(amount))
      : number(Number(amount));
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: zone,
  }).format(
    new Date(calendarWallToInstant(`${snapshot.localDate}T12:00`, zone)),
  );
  const kind = t(`audience.kind.${snapshot.tag.kind}`);
  const item = (task: SummaryTaskItem) => {
    const label = `#${task.number} ${task.title}`;
    const text = task.ownerName
      ? t("summary.taskOwner", { task: label, owner: task.ownerName })
      : label;
    const href = taskHref?.(task.taskId);
    return (
      <li key={task.taskId} data-testid="summary-task">
        {href ? <a href={href}>{text}</a> : text}
        {task.dueAt && (
          <span className="summary-quiet">
            {" "}
            · {t("summary.due", { date: instant(task.dueAt) })}
          </span>
        )}
      </li>
    );
  };
  return (
    <article
      className="summary-document"
      data-testid="summary-view"
      data-hash={contentHash}
    >
      <WatermarkLayer text={watermark.text} />
      <header className="summary-header">
        <p className="summary-eyebrow" data-testid="summary-eyebrow">
          {t("summary.eyebrow", { kind, org: snapshot.tag.org })}
          {snapshot.tag.label && ` · ${snapshot.tag.label}`}
        </p>
        <h1>{t("summary.heading")}</h1>
        <p className="summary-date" data-testid="summary-date">
          {day}
        </p>
        <p className="summary-quiet">
          {snapshot.workspace.name} ·{" "}
          {t("summary.forRecipient", { name: snapshot.recipient.name })}
        </p>
        {actions && <div className="summary-actions">{actions}</div>}
      </header>
      {!watermark.summaryId && (
        <p
          className="summary-note"
          role="status"
          data-testid="summary-preview-note"
        >
          {t("summary.preview")}
        </p>
      )}
      <dl className="summary-totals" data-testid="summary-totals">
        {(
          [
            "projects",
            "open",
            "completedToday",
            "movedToday",
            "dueToday",
            "overdue",
            "blocked",
            "inReview",
          ] as const
        ).map((key) => (
          <div key={key} data-total={key}>
            <dt>{t(`summary.totals.${key}`)}</dt>
            <dd>{number(snapshot.totals[key])}</dd>
          </div>
        ))}
      </dl>
      {snapshot.projects.length === 0 && (
        <p className="summary-quiet">{t("summary.noProjects")}</p>
      )}
      {snapshot.projects.map((project) => (
        <section
          key={project.projectId}
          className="summary-project"
          data-testid="summary-project"
          data-project={project.projectId}
          data-level={project.risk.level}
        >
          <header>
            <h2>{project.name}</h2>
            <p className="summary-meta">
              <span className="summary-level" data-level={project.risk.level}>
                {t(`timeline.risk.level.${project.risk.level}`)}
              </span>
              {project.stage && (
                <span className="summary-chip">
                  {t(`projects.stages.${project.stage}`)}
                </span>
              )}
              {project.leadName && (
                <span>{t("summary.lead", { name: project.leadName })}</span>
              )}
              {project.dueAt && (
                <span>
                  {t("summary.due", { date: instant(project.dueAt) })}
                </span>
              )}
            </p>
          </header>
          <p className="summary-meta">
            <span>
              {t("summary.delivery", {
                percent: percent(project.risk.deliveryPercent),
              })}
            </span>
            {project.deliveryProgress > 0 && (
              <span>
                {t("summary.recorded", {
                  percent: percent(project.deliveryProgress),
                })}
              </span>
            )}
            {project.risk.forecastEnd && (
              <span>
                {t("summary.forecast", {
                  date: civil(project.risk.forecastEnd),
                })}
              </span>
            )}
            {project.risk.slipDays > 0 && (
              <span>{t("summary.slip", { count: project.risk.slipDays })}</span>
            )}
          </p>
          {project.risk.reasons.length > 0 && (
            <ul className="summary-reasons">
              {project.risk.reasons.map((reason) => (
                <li key={reason}>{t(`timeline.risk.reason.${reason}`)}</li>
              ))}
            </ul>
          )}
          {project.finance && (
            <p className="summary-meta" data-testid="summary-finance">
              {project.finance.contractAmount
                ? t("summary.finance", {
                    collected: money(
                      project.finance.collectedAmount,
                      project.finance.currency,
                    ),
                    contract: money(
                      project.finance.contractAmount,
                      project.finance.currency,
                    ),
                  })
                : t("summary.financeNoContract", {
                    collected: money(
                      project.finance.collectedAmount,
                      project.finance.currency,
                    ),
                  })}
              {project.finance.collectedPercent !== null &&
                ` · ${percent(project.finance.collectedPercent)}`}
            </p>
          )}
          {(project.agentRuns.completedToday > 0 ||
            project.agentRuns.pendingReview > 0) && (
            <p className="summary-quiet">
              {t("summary.agentRuns", {
                completed: number(project.agentRuns.completedToday),
                pending: number(project.agentRuns.pendingReview),
              })}
            </p>
          )}
          {LISTS.map((list) =>
            project[list].length ? (
              <div key={list} className="summary-list" data-list={list}>
                <h3>
                  {t(`summary.lists.${list}`)} · {number(project.counts[list])}
                </h3>
                <ul>{project[list].map(item)}</ul>
              </div>
            ) : null,
          )}
        </section>
      ))}
      {snapshot.truncated && (
        <p className="summary-quiet" role="status">
          {t("summary.truncated")}
        </p>
      )}
      <footer className="summary-footer" data-testid="summary-footer">
        <p>{t("summary.confidential", { name: watermark.recipientName })}</p>
        {createdAt && (
          <p>
            {t("summary.generated", {
              date: instant(createdAt, true),
              zone,
            })}
          </p>
        )}
        <p className="summary-hash" data-testid="summary-hash">
          {t("summary.hash", { hash: contentHash })}
        </p>
      </footer>
    </article>
  );
}
