"use client";

import {
  type ProjectPhase,
  projectPhaseEditSchema,
  projectPhaseInputSchema,
  projectPhaseSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { projectPhasesKey } from "../lib/project-phases";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

export function ProjectPhaseSheet({
  projectId,
  phase,
  today,
  onClose,
}: {
  projectId: string;
  phase: ProjectPhase | null;
  today: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const id = useId();
  const [name, setName] = useState(phase?.name ?? "");
  const [start, setStart] = useState(phase?.start ?? today);
  const [end, setEnd] = useState(phase?.end ?? today);
  const fields = { name: name.trim(), start, end };
  const input = phase
    ? projectPhaseEditSchema.safeParse(fields)
    : projectPhaseInputSchema.safeParse({ projectId, ...fields });
  const save = useMutation({
    mutationFn: async (value: NonNullable<typeof input.data>) =>
      projectPhaseSchema.parse(
        await request(
          phase ? `/api/project-phases/${phase.id}` : "/api/project-phases",
          {
            method: phase ? "PATCH" : "POST",
            body: JSON.stringify(value),
          },
        ),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: projectPhasesKey(projectId) });
      onClose();
    },
  });
  return (
    <SheetDialog
      title={t(phase ? "timeline.editPhase" : "timeline.addPhase")}
      onClose={onClose}
    >
      <form
        className="timeline-footer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.success && !save.isPending) save.mutate(input.data);
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-name`}>{t("timeline.phaseName")}</Label>
          <Input
            id={`${id}-name`}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {Array.from(fields.name).length > 120 && (
            <p className="alert" role="alert">
              {t("timeline.phaseNameLimit")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-start`}>{t("timeline.start")}</Label>
          <Input
            id={`${id}-start`}
            type="date"
            min="1970-01-01"
            max="2199-12-31"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor={`${id}-end`}>{t("timeline.phaseEnd")}</Label>
          <Input
            id={`${id}-end`}
            type="date"
            min="1970-01-01"
            max="2199-12-31"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        {start && end && end < start && (
          <p className="alert" role="alert">
            {t("timeline.phaseDateOrder")}
          </p>
        )}
        {save.error && (
          <p className="alert" role="alert">
            {t(errorKey(save.error))}
          </p>
        )}
        <div className="action-row">
          <Button type="button" onClick={onClose}>
            {t("timeline.cancel")}
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
    </SheetDialog>
  );
}
