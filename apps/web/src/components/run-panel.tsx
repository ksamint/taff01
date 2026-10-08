"use client";

import {
  type ControlRun,
  controlRunSchema,
  type RunDetail,
  runSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  FileText,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

export function RunPanel({
  detail,
  refresh,
}: {
  detail: RunDetail;
  refresh: () => void;
}) {
  const { me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const { run } = detail;
  const control = useMutation({
    mutationFn: (body: ControlRun) =>
      request(`/api/runs/${run.id}/control`, {
        method: "POST",
        body: JSON.stringify(controlRunSchema.parse(body)),
      }).then(runSchema.parse),
    onSuccess: () => dialog.current?.close(),
    onSettled: () => invalidateM3(client),
  });
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: me.user.tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const duration = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    maximumFractionDigits: 1,
  }).format(run.durationMs / 1000);
  const cost = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(run.costMicros / 1_000_000);
  const active = ["running", "paused", "changes_requested"].includes(
    run.status,
  );
  return (
    <section
      className="run-panel"
      aria-labelledby="run-heading"
      data-testid="run-panel"
    >
      <div className="section-heading">
        <h2 id="run-heading">
          <Sparkles size={16} aria-hidden="true" />
          {t("run.title")}
        </h2>
        <span className={`status run-${run.status}`} data-testid="run-status">
          {t(`run.status.${run.status}`)}
        </span>
      </div>
      <div className="run-metrics">
        <span>{t("run.duration", { duration })}</span>
        <span>{t("run.cost", { cost })}</span>
      </div>
      <p className="section-hint">
        {t("run.started", { date: when(run.startedAt) })}
      </p>
      {run.summary && <p className="preserve-text">{run.summary}</p>}
      <div className="action-row">
        {detail.canControl && active && (
          <>
            {run.status === "running" ? (
              <Button
                data-testid="run-pause"
                disabled={control.isPending}
                onClick={() =>
                  control.mutate({ action: "pause", version: run.version })
                }
              >
                <Pause size={14} aria-hidden="true" />
                {t("run.pause")}
              </Button>
            ) : (
              <Button
                data-testid="run-resume"
                disabled={control.isPending}
                onClick={() =>
                  control.mutate({ action: "resume", version: run.version })
                }
              >
                <Play size={14} aria-hidden="true" />
                {t("run.resume")}
              </Button>
            )}
            <Button
              data-testid="run-cancel"
              className="button-quiet"
              disabled={control.isPending}
              onClick={() => dialog.current?.showModal()}
            >
              {t("run.cancel")}
            </Button>
          </>
        )}
        <Button
          data-testid="run-refresh"
          className="button-quiet"
          onClick={refresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {t("run.refresh")}
        </Button>
        <Link className="button button-quiet" href={`/agents/${run.agentId}`}>
          {t("agentProfile.open")}
        </Link>
      </div>
      {control.isError && (
        <p className="alert" role="alert">
          {t(errorKey(control.error))}
        </p>
      )}
      <h3 className="section-label">{t("run.timeline")}</h3>
      {detail.events.length === 0 ? (
        <p className="section-hint">{t("run.noEvents")}</p>
      ) : (
        <ol className="run-events">
          {detail.events.map((event) => (
            <li key={event.id}>
              <span className="event-icon" aria-hidden="true">
                {event.testStatus === "failed" ? (
                  <CircleAlert size={14} />
                ) : event.testStatus === "passed" ? (
                  <Check size={14} />
                ) : (
                  <FileText size={14} />
                )}
              </span>
              <div>
                <div className="section-heading">
                  <strong>{event.title}</strong>
                  <time dateTime={event.createdAt}>
                    {when(event.createdAt)}
                  </time>
                </div>
                <span className="section-hint">
                  {t(`run.eventKind.${event.kind}`)}
                  {event.testStatus
                    ? ` · ${t(`review.testStatus.${event.testStatus}`)}`
                    : ""}
                </span>
                {event.text && <p className="preserve-text">{event.text}</p>}
                {event.sourceUrl && (
                  <a
                    className="text-link"
                    href={event.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.sourceUrl}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby="cancel-run-heading"
      >
        <h2 id="cancel-run-heading">{t("run.cancelQuestion")}</h2>
        <p>{t("run.cancelHint")}</p>
        <div className="action-row">
          <Button
            disabled={control.isPending}
            className="button-primary"
            onClick={() =>
              control.mutate({ action: "cancel", version: run.version })
            }
          >
            {t("run.cancel")}
          </Button>
          <Button
            disabled={control.isPending}
            onClick={() => dialog.current?.close()}
          >
            {t("run.keep")}
          </Button>
        </div>
        {control.isError && (
          <p className="alert" role="alert">
            {t(errorKey(control.error))}
          </p>
        )}
      </dialog>
    </section>
  );
}
