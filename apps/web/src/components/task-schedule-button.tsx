"use client";
import type { TaskCalendar } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useSetCalendar, useTaskCalendar } from "../lib/calendar-queries";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

const Editor = dynamic(
  () => import("./schedule-editor").then((module) => module.ScheduleEditor),
  { ssr: false },
);
export function TaskScheduleButton({ taskId }: { taskId: string }) {
  const { me } = useWorkspace();
  const { t } = useTranslation();
  const current = useTaskCalendar(taskId);
  const update = useSetCalendar();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [editing, setEditing] = useState<TaskCalendar>();
  return (
    <>
      <Button
        className="button-quiet"
        data-testid="task-schedule"
        disabled={busy || !current.data?.canSchedule}
        onClick={() => {
          update.reset();
          setEditing(current.data);
        }}
      >
        {t(current.data?.schedule ? "calendar.edit" : "calendar.schedule")}
      </Button>
      {current.error && (
        <p role="alert" className="alert">
          {t(errorKey(current.error))}
        </p>
      )}
      {editing && (
        <Editor
          current={{
            ...editing,
            canSchedule: current.data?.canSchedule ?? false,
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
