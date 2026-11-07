import "../styles/summaries.css";
import {
  buildSummaryLayout,
  type DailySummarySnapshot,
  type SummaryLocale,
  type SummaryWatermark,
} from "@taff/schemas";
import type { ReactNode } from "react";

/**
 * One shareholder summary (ADR 0027). Presentational only: no hooks and no
 * client state, so the in-app pages (react-i18next) and the server-rendered
 * public link page (a fixed i18next translator) render the same markup.
 * It draws the shared display layout (ADR 0029 amendment 1), the same one the
 * text and image renders use, so all three show the same facts and wording.
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

const LOCALES: readonly SummaryLocale[] = ["en", "zh-CN", "zh-HK"];

function Bar({
  label,
  percent,
  kind,
}: {
  label: string;
  percent: number | null;
  kind: "progress" | "finance";
}) {
  return (
    <div
      className="summary-bar"
      data-testid={kind === "finance" ? "summary-finance" : "summary-progress"}
    >
      <span>{label}</span>
      {percent !== null && (
        <div
          className="summary-track"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="summary-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
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
  const layout = buildSummaryLayout(
    snapshot,
    watermark,
    contentHash,
    createdAt,
    LOCALES.find((value) => value === locale) ?? "en",
    t,
  );
  return (
    <article
      className="summary-document"
      data-testid="summary-view"
      data-hash={contentHash}
    >
      <WatermarkLayer text={watermark.text} />
      <header className="summary-header">
        <p className="summary-eyebrow" data-testid="summary-eyebrow">
          {layout.header.audience}
        </p>
        <h1>{layout.header.title}</h1>
        <p className="summary-date" data-testid="summary-date">
          {layout.header.date}
        </p>
        <p className="summary-quiet">
          {layout.header.workspace} · {layout.header.recipient}
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
        {layout.kpis.map((kpi) => (
          <div key={kpi.key} data-total={kpi.key} data-tone={kpi.tone}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
          </div>
        ))}
      </dl>
      {layout.empty && <p className="summary-quiet">{layout.empty}</p>}
      {layout.projects.map((project) => (
        <section
          key={project.projectId}
          className="summary-project"
          data-testid="summary-project"
          data-project={project.projectId}
          data-level={project.risk.level}
        >
          <header className="summary-project-head">
            <h2>{project.name}</h2>
            <span className="summary-level" data-level={project.risk.level}>
              {project.risk.label}
            </span>
          </header>
          {(project.stage || project.meta.length > 0) && (
            <p className="summary-meta">
              {project.stage && (
                <span className="summary-chip">{project.stage}</span>
              )}
              {project.meta.map((entry) => (
                <span key={entry}>{entry}</span>
              ))}
            </p>
          )}
          {project.risk.reasons.length > 0 && (
            <ul className="summary-reasons" data-level={project.risk.level}>
              {project.risk.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <Bar
            label={project.progress.label}
            percent={project.progress.percent}
            kind="progress"
          />
          {project.finance && (
            <Bar
              label={project.finance.label}
              percent={project.finance.percent}
              kind="finance"
            />
          )}
          {project.agentRuns && (
            <p className="summary-quiet">{project.agentRuns}</p>
          )}
          {project.sections.map((section) => (
            <div
              key={section.key}
              className="summary-list"
              data-list={section.key}
            >
              <h3>
                {section.title}
                <span className="summary-count">{section.count}</span>
              </h3>
              <ul>
                {section.items.map((task) => {
                  const href = taskHref?.(task.taskId);
                  return (
                    <li
                      key={task.taskId}
                      data-testid="summary-task"
                      data-overdue={task.overdue || undefined}
                    >
                      <span className="summary-task-number">{task.number}</span>
                      <span className="summary-task-body">
                        {href ? <a href={href}>{task.title}</a> : task.title}
                        {task.detail && (
                          <span className="summary-task-detail">
                            {task.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {section.more && <p className="summary-more">{section.more}</p>}
            </div>
          ))}
        </section>
      ))}
      {layout.moreProjects && (
        <p className="summary-more">{layout.moreProjects}</p>
      )}
      <footer className="summary-footer" data-testid="summary-footer">
        <p>{layout.footer.confidential}</p>
        {layout.footer.generated && <p>{layout.footer.generated}</p>}
        <p className="summary-hash" data-testid="summary-hash">
          {layout.footer.hashLabel} {layout.footer.hashFull}
        </p>
      </footer>
    </article>
  );
}
