"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useTimeEntries } from "../lib/time-queries";
import { TimeEntryForm } from "./time-entry-form";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

export function TaskTime({
  taskId,
  workspaceId,
}: {
  taskId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t("timeTracking.log")}
      </Button>
      {open && (
        <LogTaskTime
          taskId={taskId}
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LogTaskTime({
  taskId,
  workspaceId,
  onClose,
}: {
  taskId: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const entries = useTimeEntries(workspaceId, taskId);
  return (
    <SheetDialog title={t("timeTracking.log")} onClose={onClose}>
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
          <TimeEntryForm
            taskId={taskId}
            today={entries.data.today}
            onClose={onClose}
          />
        </>
      )}
    </SheetDialog>
  );
}
