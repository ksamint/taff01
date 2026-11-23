"use client";
import "../styles/time-tracking.css";

import type { TimeEntry } from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useTasks } from "../lib/queries";
import {
  timeEntriesFamily,
  useMemberRates,
  useTimeEntries,
} from "../lib/time-queries";
import { useWorkspace } from "./app-shell";
import { formatHourlyRate, MemberRateSheet } from "./member-rate-sheet";
import { SettingsBackHeader } from "./settings-back-header";
import { TimeEntryForm } from "./time-entry-form";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

export function MyTimeView() {
  const { confirmed, workspace } = useWorkspace();
  const { t } = useTranslation();
  return (
    <div className="settings-page-gutter">
      <SettingsBackHeader href="/me?tab=settings" label={t("me.title")} />
      <div className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("timeTracking.title")}</h1>
      </div>
      {confirmed ? (
        <MyTime key={workspace.id} />
      ) : (
        <p aria-live="polite">{t("loading")}</p>
      )}
    </div>
  );
}

function MyTime() {
  const { workspace, me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const entries = useTimeEntries(workspace.id);
  const rates = useMemberRates(workspace.id);
  const tasks = useTasks(workspace.id);
  const [panel, setPanel] = useState<
    { type: "edit" | "delete"; entry: TimeEntry } | { type: "rates" } | null
  >(null);
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const today = entries.isSuccess ? entries.data.today : undefined;
  const own = (entries.data?.entries ?? []).filter(
    (entry) => entry.personId === workspace.memberId,
  );
  const current = rates.data?.find(
    (rate) =>
      rate.personId === workspace.memberId && today && rate.validFrom <= today,
  );
  const admin = workspace.role === "admin";
  const close = () => setPanel(null);
  return (
    <>
      <section className="my-time-rate" aria-label={t("timeTracking.ownRate")}>
        <div>
          <h2>{t("timeTracking.ownRate")}</h2>
          {rates.error ? (
            <div className="alert" role="alert">
              <p>{t(errorKey(rates.error))}</p>
              <Button type="button" onClick={() => void rates.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : rates.isPending ? (
            <p aria-live="polite">{t("loading")}</p>
          ) : today ? (
            <p>
              {current
                ? t("timeTracking.perHour", {
                    rate: formatHourlyRate(current, locale),
                  })
                : t("timeTracking.noRate")}
            </p>
          ) : null}
        </div>
        {admin && (
          <Button
            type="button"
            disabled={!today}
            onClick={() => setPanel({ type: "rates" })}
          >
            {t("timeTracking.setRate")}
          </Button>
        )}
      </section>
      {entries.isPending && <p aria-live="polite">{t("loading")}</p>}
      {entries.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(entries.error))}</p>
          <Button type="button" onClick={() => void entries.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {entries.isSuccess && (
        <>
          <p className="section-hint">
            {t("timeTracking.zone", { timeZone: entries.data.timeZone })}
          </p>
          {own.length === 0 ? (
            <p className="section-hint">{t("timeTracking.empty")}</p>
          ) : (
            <ul className="my-time-entries">
              {own.map((entry) => {
                const task = tasks.data?.find(
                  (item) => item.id === entry.taskId,
                );
                return (
                  <li key={entry.id}>
                    <div className="my-time-entry-details">
                      {task ? (
                        <Link className="text-link" href={`/tasks/${task.id}`}>
                          {task.title}
                        </Link>
                      ) : (
                        <span>
                          {tasks.isPending
                            ? t("loading")
                            : t("timeTracking.unavailableTask")}
                        </span>
                      )}
                      <p>
                        <time dateTime={entry.day}>
                          {date.format(new Date(`${entry.day}T00:00:00Z`))}
                        </time>
                        {" · "}
                        {t("timeTracking.duration", { count: entry.minutes })}
                      </p>
                      {entry.note && (
                        <p className="preserve-text">{entry.note}</p>
                      )}
                    </div>
                    <div className="action-row">
                      <Button
                        type="button"
                        onClick={() => setPanel({ type: "edit", entry })}
                      >
                        {t("timeTracking.edit")}
                      </Button>
                      <Button
                        type="button"
                        className="button-quiet"
                        onClick={() => setPanel({ type: "delete", entry })}
                      >
                        {t("timeTracking.remove")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {panel?.type === "edit" && today && (
        <SheetDialog title={t("timeTracking.edit")} onClose={close}>
          <TimeEntryForm
            taskId={panel.entry.taskId}
            today={today}
            entry={panel.entry}
            onClose={close}
          />
        </SheetDialog>
      )}
      {panel?.type === "delete" && (
        <RemoveTimeEntry id={panel.entry.id} onClose={close} />
      )}
      {panel?.type === "rates" && admin && today && (
        <MemberRateSheet today={today} onClose={close} />
      )}
    </>
  );
}

function RemoveTimeEntry({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => request(`/api/time-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: timeEntriesFamily });
      onClose();
    },
  });
  return (
    <SheetDialog title={t("timeTracking.removeQuestion")} onClose={onClose}>
      {remove.error && (
        <p className="alert" role="alert">
          {t(errorKey(remove.error))}
        </p>
      )}
      <div className="action-row">
        <Button type="button" onClick={onClose}>
          {t("planning.cancel")}
        </Button>
        <Button
          type="button"
          className="button-danger"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t(remove.isPending ? "working" : "timeTracking.remove")}
        </Button>
      </div>
    </SheetDialog>
  );
}
