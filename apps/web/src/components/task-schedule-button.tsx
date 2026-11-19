"use client";
import type { TaskCalendar } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useSetCalendar } from "../lib/calendar-queries";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

const Editor = dynamic(
  () => import("./schedule-editor").then((module) => module.ScheduleEditor),
  { ssr: false },
);
export function TaskScheduleButton({
  current,
  error,
  scheduleText,
}: {
  current: TaskCalendar | undefined;
  error: Error | null;
  scheduleText: string | undefined;
}) {
  const { me } = useWorkspace();
  const { t } = useTranslation();
  const update = useSetCalendar();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [editing, setEditing] = useState<TaskCalendar>();
  return (
    <>
      <Button
        type="button"
        className="task-field-row"
        data-testid="task-schedule"
        disabled={busy || !current?.canSchedule}
        onClick={() => {
          update.reset();
          setEditing(current);
        }}
      >
        <span>{t("calendar.schedule")}</span>
        <span>{scheduleText ?? t("taskDetail.unscheduled")}</span>
      </Button>
      {error && (
        <p role="alert" className="alert">
          {t(errorKey(error))}
        </p>
      )}
      {editing && (
        <Editor
          current={{
            ...editing,
            canSchedule: current?.canSchedule ?? false,
          }}
          timeZone={me.user.tz}
          startAt={new Date().toISOString()}
          busy={busy}
          error={update.error ? t(errorKey(update.error)) : undefined}
          onClose={() => setEditing(undefined)}
          onSave={(schedule) =>
            update.mutate({
              current: editing,
              input: { version: editing.task.version, schedule },
              onDone: () => setEditing(undefined),
            })
          }
          onClear={() =>
            update.mutate({
              current: editing,
              input: { version: editing.task.version, schedule: null },
              onDone: () => setEditing(undefined),
            })
          }
        />
      )}
    </>
  );
}
