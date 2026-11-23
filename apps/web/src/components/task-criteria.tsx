"use client";

import "../styles/task-criteria.css";

import {
  type TaskCriterion,
  taskCriteriaListSchema,
  taskCriteriaReorderSchema,
  taskCriterionEditSchema,
  taskCriterionInputSchema,
  taskCriterionSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { currentSession } from "../lib/session-cache";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const path = "/api/task-criteria";

type CriteriaChange =
  | { action: "save"; id?: string; text: string }
  | { action: "reorder"; ids: string[] }
  | { action: "check" | "uncheck"; id: string };

export function TaskCriteria({
  taskId,
  canEdit = false,
  canCheck = false,
}: {
  taskId: string;
  canEdit?: boolean;
  canCheck?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const heading = useId();
  const field = useId();
  const [editor, setEditor] = useState<{ id?: string; text: string } | null>(
    null,
  );
  const queryKey = ["task-criteria", taskId] as const;
  const query = useQuery({
    queryKey,
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    retry: false,
    queryFn: async () =>
      taskCriteriaListSchema.parse(
        await request(`${path}?taskId=${encodeURIComponent(taskId)}`),
      ),
  });
  const change = useMutation({
    mutationFn: async (input: CriteriaChange) => {
      switch (input.action) {
        case "save": {
          const body = input.id
            ? taskCriterionEditSchema.parse({ text: input.text })
            : taskCriterionInputSchema.parse({ taskId, text: input.text });
          return taskCriterionSchema.parse(
            await request(input.id ? `${path}/${input.id}` : path, {
              method: input.id ? "PATCH" : "POST",
              body: JSON.stringify(body),
            }),
          );
        }
        case "reorder":
          return taskCriteriaListSchema.parse(
            await request(`${path}/reorder`, {
              method: "POST",
              body: JSON.stringify(
                taskCriteriaReorderSchema.parse({ taskId, ids: input.ids }),
              ),
            }),
          );
        case "check":
        case "uncheck":
          return taskCriterionSchema.parse(
            await request(`${path}/${input.id}/${input.action}`, {
              method: "POST",
            }),
          );
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const criteria = query.data ?? [];
  const disabled = change.isPending || !query.isSuccess;
  const valid = taskCriterionEditSchema.safeParse({
    text: editor?.text,
  }).success;
  const editingChecked =
    !!editor?.id &&
    criteria.some(({ id, checkedAt }) => id === editor.id && !!checkedAt);
  const error = query.error ?? change.error;

  function open(criterion?: TaskCriterion) {
    change.reset();
    setEditor(
      criterion ? { id: criterion.id, text: criterion.text } : { text: "" },
    );
  }

  function move(index: number, offset: number) {
    const ids = criteria.map(({ id }) => id);
    const [id] = ids.splice(index, 1);
    if (!id) return;
    ids.splice(index + offset, 0, id);
    change.mutate({ action: "reorder", ids });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || disabled || !valid || editingChecked) return;
    change.mutate(
      { action: "save", ...editor },
      { onSuccess: () => setEditor(null) },
    );
  }

  if (!canEdit && query.isSuccess && criteria.length === 0) return null;
  return (
    <section className="task-criteria" aria-labelledby={heading}>
      <div className="section-heading">
        <h2 id={heading}>{t("taskCriteria.title")}</h2>
        {canEdit && (
          <Button type="button" disabled={disabled} onClick={() => open()}>
            {t("taskCriteria.add")}
          </Button>
        )}
      </div>
      {query.isPending && <p className="loading">{t("loading")}</p>}
      {query.isSuccess && criteria.length === 0 && (
        <p className="section-hint">{t("taskCriteria.empty")}</p>
      )}
      {criteria.length > 0 && (
        <ul className="task-criteria-list">
          {criteria.map((criterion, index) => (
            <li key={criterion.id}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!criterion.checkedAt}
                  disabled={!canCheck || disabled}
                  onChange={(event) =>
                    change.mutate({
                      action: event.target.checked ? "check" : "uncheck",
                      id: criterion.id,
                    })
                  }
                />
                <span className="preserve-text">{criterion.text}</span>
              </label>
              {canEdit && (
                <div className="task-criteria-actions">
                  <Button
                    type="button"
                    className="button-quiet"
                    disabled={disabled || !!criterion.checkedAt}
                    onClick={() => open(criterion)}
                  >
                    {t("taskCriteria.edit")}
                  </Button>
                  <Button
                    type="button"
                    className="button-quiet"
                    disabled={disabled || index === 0}
                    aria-label={t("taskCriteria.moveUp")}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    className="button-quiet"
                    disabled={disabled || index === criteria.length - 1}
                    aria-label={t("taskCriteria.moveDown")}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !editor && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {canEdit && editor && (
        <SheetDialog
          title={t(editor.id ? "taskCriteria.edit" : "taskCriteria.add")}
          onClose={() => {
            if (!change.isPending) setEditor(null);
          }}
        >
          <form onSubmit={submit} className="task-criteria-form">
            <div className="field">
              <Label htmlFor={field}>{t("taskCriteria.text")}</Label>
              <textarea
                id={field}
                className="input"
                rows={3}
                value={editor.text}
                disabled={change.isPending}
                onChange={(event) =>
                  setEditor({ ...editor, text: event.target.value })
                }
              />
            </div>
            {Array.from(editor.text).length > 300 && (
              <p className="alert" role="alert">
                {t("taskCriteria.maxLength")}
              </p>
            )}
            {error && (
              <p className="alert" role="alert">
                {t(errorKey(error))}
              </p>
            )}
            <Button
              type="submit"
              className="button-primary"
              disabled={disabled || !valid || editingChecked}
            >
              {t("taskCriteria.save")}
            </Button>
          </form>
        </SheetDialog>
      )}
    </section>
  );
}
