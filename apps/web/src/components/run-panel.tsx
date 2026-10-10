"use client";

import {
  type ControlRun,
  controlRunSchema,
  type RunDetail,
  runSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Lock,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { isLocale } from "../lib/i18n";
import { invalidateM3, useAgent } from "../lib/m3-queries";
import {
  m3MutationKey,
  patchRun,
  patchTask,
  resolveInbox,
  snapshotM3,
} from "../lib/optimistic-m3";
import { restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { GrantActions } from "./grant-actions";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

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
  const headingId = useId();
  const cancelHeadingId = useId();
  const agent = useAgent(run.agentId);
  const [grantId, setGrantId] = useState<string | null>(null);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const control = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ControlRun) =>
      request(`/api/runs/${run.id}/control`, {
        method: "POST",
        body: JSON.stringify(controlRunSchema.parse(body)),
      }).then(runSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      patchRun(client, run.id, {
        status:
          body.action === "pause"
            ? "paused"
            : body.action === "resume"
              ? "running"
              : "canceled",
      });
      patchTask(client, run.taskId, {
        status: body.action === "cancel" ? "todo" : "in_progress",
      });
      if (body.action === "cancel")
        resolveInbox(client, (item) => item.runId === run.id);
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
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
  const presentationLocale = isLocale(locale) ? locale : me.user.locale;
  const agentName = agent.data ? agent.data.member.name : t("run.title");
  // Events are reports, not a persisted plan; never infer an unreported total
  // or label a reported step complete unless its result actually says so.
  const steps = detail.events.filter((event) => event.kind === "step");
  const blockers =
    run.status === "paused"
      ? (agent.data?.grants.filter(
          (grant) => grant.runId === run.id && grant.status === "pending",
        ) ?? [])
      : [];
  const selectedGrant = agent.data?.grants.find(
    (grant) => grant.id === grantId && grant.runId === run.id,
  );
  return (
    <section
      className={`run-panel run-panel-parity${blockers.length ? " has-blocker" : ""}`}
      aria-labelledby={headingId}
      data-testid="run-panel"
    >
      <div className="run-source-block">
        <div className="run-source-heading">
          <span
            className={`run-source-dot run-source-${run.status}`}
            aria-hidden="true"
          />
          <h2 id={headingId} title={agentName}>
            {agentName}
          </h2>
          <span
            className={`run-source-status run-${run.status}`}
            data-testid="run-status"
          >
            {t(`run.status.${run.status}`)}
          </span>
          {steps.length > 0 && (
            <span className="run-reported-count">
              {new Intl.NumberFormat(locale).format(steps.length)} ·{" "}
              {t("run.eventKind.step")}
            </span>
          )}
        </div>
        {steps.length > 0 && (
          <ol className="run-source-steps">
            {steps.slice(-4).map((event) => (
              <li key={event.id}>
                <span className="run-step-icon" aria-hidden="true">
                  {event.testStatus === "passed" ? (
                    <Check size={14} />
                  ) : event.testStatus === "failed" ? (
                    <CircleAlert size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                </span>
                <span>{event.title}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="run-source-controls">
          {detail.canControl && active && (
            <>
              {run.status === "running" ? (
                <Button
                  type="button"
                  data-testid="run-pause"
                  disabled={busy}
                  onClick={() =>
                    control.mutate({ action: "pause", version: run.version })
                  }
                >
                  <Pause size={14} aria-hidden="true" />
                  {t("run.pause")}
                </Button>
              ) : (
                <Button
                  type="button"
                  data-testid="run-resume"
                  disabled={busy}
                  onClick={() =>
                    control.mutate({ action: "resume", version: run.version })
                  }
                >
                  <Play size={14} aria-hidden="true" />
                  {t("run.resume")}
                </Button>
              )}
              <Button
                type="button"
                data-testid="run-cancel"
                className="button-quiet"
                disabled={busy}
                onClick={() => dialog.current?.showModal()}
              >
                {t("run.cancel")}
              </Button>
            </>
          )}
        </div>
      </div>
      {blockers.map((grant) => (
        <div
          className="run-blocker-block"
          key={grant.id}
          data-testid="run-blocker"
        >
          <h3>
            <CircleAlert size={16} aria-hidden="true" />
            {t("grants.pending")}
          </h3>
          <p className="run-blocker-capability">
            {t(`agentProfile.capability.${grant.capability}`)}
          </p>
          <p className="preserve-text">{grant.reason}</p>
          {agent.data?.canDecideGrants && (
            <Button
              type="button"
              className="button-primary"
              data-testid="run-grant"
              disabled={busy}
              onClick={() => setGrantId(grant.id)}
            >
              <Lock size={14} aria-hidden="true" />
              {t("grants.allow")}
            </Button>
          )}
        </div>
      ))}
      {control.isError && (
        <p className="alert" role="alert">
          {t(errorKey(control.error))}
        </p>
      )}
      {agent.isError && (
        <p className="alert" role="alert">
          {t(errorKey(agent.error))}
        </p>
      )}
      <details className="run-supporting" data-testid="run-details">
        <summary>
          {t("run.timeline")}
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="run-supporting-body">
          <div className="run-metrics">
            <span>{t("run.duration", { duration })}</span>
            <span>{t("run.cost", { cost })}</span>
          </div>
          <p className="section-hint">
            {t("run.started", { date: when(run.startedAt) })}
          </p>
          {run.summary && <p className="preserve-text">{run.summary}</p>}
          <div className="run-supporting-actions">
            <Button
              type="button"
              data-testid="run-refresh"
              className="button-quiet"
              disabled={busy}
              onClick={refresh}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t("run.refresh")}
            </Button>
            <Link
              className="button button-quiet"
              href={`/agents/${run.agentId}`}
              prefetch={false}
            >
              {t("agentProfile.open")}
            </Link>
          </div>
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
                    {event.text && (
                      <p className="preserve-text">{event.text}</p>
                    )}
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
        </div>
      </details>
      {selectedGrant && (
        <SheetDialog title={t("grants.allow")} onClose={() => setGrantId(null)}>
          <p className="preserve-text">{selectedGrant.reason}</p>
          <p>{t(`grants.status.${selectedGrant.status}`)}</p>
          <GrantActions
            grant={selectedGrant}
            canDecide={agent.data?.canDecideGrants ?? false}
          />
        </SheetDialog>
      )}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby={cancelHeadingId}
        onCancel={(event) => event.stopPropagation()}
      >
        <h2 id={cancelHeadingId}>{t("run.cancelQuestion")}</h2>
        <p>{t("run.cancelHint")}</p>
        <div className="action-row">
          <Button
            type="button"
            disabled={busy}
            className="button-primary"
            onClick={() =>
              control.mutate({ action: "cancel", version: run.version })
            }
          >
            {t("run.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy}
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
