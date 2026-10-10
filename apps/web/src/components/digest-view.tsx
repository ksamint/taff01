"use client";
import { calendarWallToInstant, type DailyDigest } from "@taff/schemas";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useDailyDigest, useDailyDigests } from "../lib/notification-queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

function localDay(digest: DailyDigest, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: digest.timeZone,
  }).format(
    new Date(
      calendarWallToInstant(`${digest.localDate}T12:00`, digest.timeZone),
    ),
  );
}
export function DailyDigestsView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const digests = useDailyDigests(workspace.id);
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  return (
    <>
      <Link className="text-link" href="/me/notifications">
        {t("notifications.title")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("notifications.history")}</h1>
        <p className="task-count">{t("notifications.digestHint")}</p>
      </section>
      {digests.isPending && <p aria-live="polite">{t("loading")}</p>}
      {digests.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(digests.error))}</p>
          <Button onClick={() => void digests.refetch()}>{t("retry")}</Button>
        </div>
      )}
      {digests.data?.truncated && (
        <p role="status">{t("digest.historyLimit")}</p>
      )}
      <ul className="task-list">
        {digests.data?.items.map((digest) => (
          <li className="digest-section" key={digest.id}>
            <Link
              className="text-link"
              href={`/digests/${digest.id}`}
              data-testid="digest-history-item"
            >
              {localDay(digest, locale)}
            </Link>
            <p className="section-hint">
              {t("digest.summary", {
                reviews: new Intl.NumberFormat(locale).format(
                  digest.snapshot.reviews.count,
                ),
                due: new Intl.NumberFormat(locale).format(
                  digest.snapshot.dueToday.count,
                ),
                agents: new Intl.NumberFormat(locale).format(
                  digest.snapshot.agents.count,
                ),
              })}
            </p>
          </li>
        ))}
      </ul>
      {digests.data?.items.length === 0 && (
        <div className="empty-state">
          <h3>{t("digest.empty")}</h3>
          <p>{t("digest.emptyHint")}</p>
        </div>
      )}
    </>
  );
}
export function DailyDigestView({ id }: { id: string }) {
  const { me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const query = useDailyDigest(id);
  const digest = query.data;
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me.user.tz,
    }).format(new Date(iso));
  return (
    <>
      <Link className="text-link" href="/inbox">
        {t("inbox.title")}
      </Link>
      <section className="page-heading">
        <h1>{t("notifications.digest")}</h1>
        {digest && <p className="task-count">{localDay(digest, locale)}</p>}
      </section>
      {query.isPending && <p aria-live="polite">{t("loading")}</p>}
      {query.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(query.error))}</p>
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        </div>
      )}
      {digest && (
        <article data-testid="daily-digest">
          <p className="section-hint">
            {t("digest.generated", {
              date: when(digest.createdAt),
              zone: digest.timeZone,
            })}
          </p>
          {digest.snapshot.truncated && (
            <p role="status">{t("digest.truncated")}</p>
          )}
          <section className="digest-section">
            <h2>
              {t("digest.reviews")} · {number(digest.snapshot.reviews.count)}
            </h2>
            <ul className="task-list">
              {digest.snapshot.reviews.items.map((item) => (
                <li key={item.taskId}>
                  <Link
                    className="text-link"
                    href={`/tasks/${item.taskId}/review`}
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
            {!digest.snapshot.reviews.count && (
              <p className="section-hint">{t("digest.none")}</p>
            )}
          </section>
          <section className="digest-section">
            <h2>
              {t("digest.due")} · {number(digest.snapshot.dueToday.count)}
            </h2>
            <ul className="task-list">
              {digest.snapshot.dueToday.items.map((item) => (
                <li key={item.taskId}>
                  <Link className="text-link" href={`/tasks/${item.taskId}`}>
                    {item.title}
                  </Link>
                  <p className="section-hint">
                    {t("due", { date: when(item.dueAt) })}
                  </p>
                </li>
              ))}
            </ul>
            {!digest.snapshot.dueToday.count && (
              <p className="section-hint">{t("digest.none")}</p>
            )}
          </section>
          <section className="digest-section">
            <h2>
              {t("digest.agents")} · {number(digest.snapshot.agents.count)}
            </h2>
            <ul className="task-list">
              {digest.snapshot.agents.items.map((item) => (
                <li key={item.runId}>
                  <Link className="text-link" href={`/tasks/${item.taskId}`}>
                    {item.title}
                  </Link>
                  <div className="digest-metrics">
                    <span>{t(`run.status.${item.status}`)}</span>
                    <span>
                      {t("digest.events", { count: number(item.eventCount) })}
                    </span>
                    <span>
                      {t("run.duration", {
                        duration: new Intl.NumberFormat(locale, {
                          style: "unit",
                          unit: "second",
                          maximumFractionDigits: 1,
                        }).format(item.durationMs / 1000),
                      })}
                    </span>
                    <span>
                      {t("run.cost", {
                        cost: new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 6,
                        }).format(item.costMicros / 1000000),
                      })}
                    </span>
                    {item.lastEventAt && (
                      <span>
                        {t("digest.lastEvent", {
                          date: when(item.lastEventAt),
                        })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!digest.snapshot.agents.count && (
              <p className="section-hint">{t("digest.none")}</p>
            )}
          </section>
        </article>
      )}
    </>
  );
}
