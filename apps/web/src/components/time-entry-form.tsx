"use client";

import {
  type TimeEntry,
  timeEntryEditSchema,
  timeEntryInputSchema,
  timeEntrySchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { timeEntriesFamily } from "../lib/time-queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function TimeEntryForm({
  taskId,
  today,
  entry,
  onClose,
}: {
  taskId: string;
  today: string;
  entry?: TimeEntry;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const id = useId();
  const [minutes, setMinutes] = useState(entry ? String(entry.minutes) : "");
  const [day, setDay] = useState(entry?.day ?? today);
  const [note, setNote] = useState(entry?.note ?? "");
  const fields = { minutes: Number(minutes), day, note };
  const input = entry
    ? timeEntryEditSchema.safeParse(fields)
    : timeEntryInputSchema.safeParse({ ...fields, taskId });
  const save = useMutation({
    mutationFn: async (value: NonNullable<typeof input.data>) =>
      timeEntrySchema.parse(
        await request(
          entry ? `/api/time-entries/${entry.id}` : "/api/time-entries",
          {
            method: entry ? "PATCH" : "POST",
            body: JSON.stringify(value),
          },
        ),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: timeEntriesFamily });
      onClose();
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (input.success && !save.isPending) save.mutate(input.data);
      }}
    >
      <div className="field">
        <Label htmlFor={`${id}-minutes`}>{t("timeTracking.minutes")}</Label>
        <Input
          id={`${id}-minutes`}
          type="number"
          min={1}
          max={1440}
          step={1}
          required
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
        {minutes &&
          (!Number.isInteger(fields.minutes) ||
            fields.minutes < 1 ||
            fields.minutes > 1440) && (
            <p className="alert" role="alert">
              {t("timeTracking.minutesRange")}
            </p>
          )}
      </div>
      <div className="field">
        <Label htmlFor={`${id}-day`}>{t("timeTracking.day")}</Label>
        <Input
          id={`${id}-day`}
          type="date"
          required
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor={`${id}-note`}>{t("timeTracking.note")}</Label>
        <textarea
          id={`${id}-note`}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {Array.from(note).length > 2000 && (
          <p className="alert" role="alert">
            {t("timeTracking.noteLimit", { max: 2000 })}
          </p>
        )}
      </div>
      {save.error && (
        <p className="alert" role="alert">
          {t(errorKey(save.error))}
        </p>
      )}
      <div className="action-row">
        <Button type="button" onClick={onClose}>
          {t("planning.cancel")}
        </Button>
        <Button
          type="submit"
          className="button-primary"
          disabled={!input.success || save.isPending}
        >
          {t(save.isPending ? "working" : "planning.save")}
        </Button>
      </div>
    </form>
  );
}
