"use client";
import { calendarWallToInstant, type DailySummary } from "@taff/schemas";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useDailySummaries, useDailySummary } from "../lib/summary-queries";
import { useWorkspace } from "./app-shell";
import { SummaryDocument, type Translate } from "./summary-document";
import { SummaryRenderActions } from "./summary-render-actions";
import { SummarySharePanel } from "./summary-share-panel";
import { Button } from "./ui/button";

export function summaryDay(summary: DailySummary, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: summary.timeZone,
  }).format(
    new Date(
      calendarWallToInstant(`${summary.localDate}T12:00`, summary.timeZone),
    ),
  );
}

/** /summaries: the signed-in person's own summaries (all of them for admins). */
export function SummariesView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const summaries = useDailySummaries(workspace.id);
  return (
    <div className="summaries-page">
      <Link className="text-link" href="/me">
        <ArrowLeft size={16} aria-hidden="true" /> {t("mcp.back")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("summary.title")}</h1>
        <p className="task-count">{t("summary.hint")}</p>
      </section>
      {summaries.isPending && <p aria-live="polite">{t("loading")}</p>}
      {summaries.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(summaries.error))}</p>
          <Button onClick={() => void summaries.refetch()}>{t("retry")}</Button>
        </div>
      )}
      {summaries.data?.truncated && (
        <p role="status">{t("summary.historyLimit")}</p>
      )}
      <ul className="task-list" data-testid="summary-list">
        {summaries.data?.items.map((summary) => (
          <li className="digest-section" key={summary.id}>
            <Link
              className="text-link"
              href={`/summaries/${summary.id}`}
              data-testid="summary-row"
              data-summary={summary.id}
            >
              {summaryDay(summary, locale)}
            </Link>
            <p className="section-hint">
              {t("summary.eyebrow", {
                kind: t(`audience.kind.${summary.snapshot.tag.kind}`),
                org: summary.snapshot.tag.org,
              })}{" "}
              · {summary.snapshot.recipient.name}
            </p>
          </li>
        ))}
      </ul>
      {summaries.data?.items.length === 0 && (
        <div className="empty-state" data-testid="summary-empty">
          <h3>{t("summary.empty")}</h3>
          <p>{t("summary.emptyHint")}</p>
        </div>
      )}
    </div>
  );
}

/** /summaries/[id]: one summary; admins also manage its share links here. */
export function SummaryView({ id }: { id: string }) {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const query = useDailySummary(id);
  const summary = query.data;
  return (
    <div className="summaries-page">
      <Link className="text-link no-print" href="/summaries">
        <ArrowLeft size={16} aria-hidden="true" /> {t("summary.title")}
      </Link>
      {query.isPending && <p aria-live="polite">{t("loading")}</p>}
      {query.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(query.error))}</p>
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        </div>
      )}
      {summary && (
        <>
          <SummaryDocument
            snapshot={summary.snapshot}
            watermark={summary.watermark}
            contentHash={summary.contentHash}
            createdAt={summary.createdAt}
            locale={locale}
            t={t as Translate}
            taskHref={(taskId) => `/tasks/${taskId}`}
            actions={
              <>
                <SummaryRenderActions
                  source={{ summaryId: summary.id }}
                  labels={{
                    copy: t("summary.copyText"),
                    save: t("summary.saveImage"),
                    copied: t("mcp.copied"),
                    copyFailed: t("organization.copyFailed"),
                    unavailable: t("errors.not_found"),
                    failed: t("errors.internal_error"),
                  }}
                />
                <Button
                  data-testid="summary-print"
                  onClick={() => window.print()}
                >
                  <Printer size={16} aria-hidden="true" /> {t("summary.print")}
                </Button>
              </>
            }
          />
          {workspace.role === "admin" &&
            summary.workspaceId === workspace.id && (
              <SummarySharePanel summaryId={summary.id} timeZone={me.user.tz} />
            )}
        </>
      )}
    </div>
  );
}
