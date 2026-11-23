"use client";

import {
  type Task,
  type TaskLink,
  taskLinkInputSchema,
  taskLinkKinds,
  taskLinkListSchema,
  taskLinkSchema,
  taskReference,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useTaskAccess } from "../lib/m5-queries";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

type Kind = TaskLink["kind"];
type Change =
  | { type: "add"; toTaskId: string; kind: Kind }
  | { type: "remove"; id: string };
const path = "/api/task-links";
const family = ["task-links"] as const;

export function TaskLinks({ task }: { task: Task }) {
  const { t } = useTranslation();
  const headingId = useId();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const links = useQuery({
    queryKey: [...family, task.id],
    queryFn: async ({ signal }) =>
      taskLinkListSchema.parse(
        await request(`${path}?${new URLSearchParams({ taskId: task.id })}`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
  const change = useMutation({
    mutationFn: async (action: Change) => {
      if (action.type === "remove") {
        await request(`${path}/${action.id}`, { method: "DELETE" });
        return;
      }
      const body = taskLinkInputSchema.parse({
        fromTaskId: task.id,
        toTaskId: action.toTaskId,
        kind: action.kind,
      });
      taskLinkSchema.parse(
        await request(path, { method: "POST", body: JSON.stringify(body) }),
      );
    },
    onSuccess: (_data, action) => {
      if (action.type === "add") setAdding(false);
      void client.invalidateQueries({ queryKey: family });
    },
  });
  const error = links.error ?? (!adding && change.error);
  return (
    <section className="task-section" aria-labelledby={headingId}>
      <div className="task-section-heading">
        <h2 id={headingId}>{t("taskLinks.title")}</h2>
        <Button
          type="button"
          disabled={!links.isSuccess || change.isPending}
          onClick={() => {
            change.reset();
            setAdding(true);
          }}
        >
          {t("taskLinks.add")}
        </Button>
      </div>
      {links.isPending && <p className="section-hint">{t("loading")}</p>}
      {error && (
        <p role="alert" className="alert">
          {t(errorKey(error))}
        </p>
      )}
      {links.isSuccess &&
        (links.data.length ? (
          <ul className="task-link-list">
            {links.data.map((link) => (
              <li key={link.id}>
                <div className="task-link-copy">
                  <Link
                    className="text-link"
                    href={`/tasks/${link.otherTaskId}`}
                  >
                    {link.otherTaskTitle}
                  </Link>
                  <span>{t(`taskLinks.kind.${link.kind}`)}</span>
                </div>
                <Button
                  type="button"
                  className="button-quiet"
                  aria-label={t("taskLinks.removeNamed", {
                    title: link.otherTaskTitle,
                    kind: t(`taskLinks.kind.${link.kind}`),
                  })}
                  disabled={change.isPending}
                  onClick={() => change.mutate({ type: "remove", id: link.id })}
                >
                  {t("actions.remove")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-hint">{t("taskLinks.empty")}</p>
        ))}
      {adding && links.isSuccess && (
        <TaskLinkPicker
          task={task}
          links={links.data}
          pending={change.isPending}
          error={change.error}
          onClose={() => setAdding(false)}
          onAdd={(toTaskId, kind) =>
            change.mutate({ type: "add", toTaskId, kind })
          }
        />
      )}
    </section>
  );
}

function TaskLinkPicker({
  task,
  links,
  pending,
  error,
  onClose,
  onAdd,
}: {
  task: Task;
  links: TaskLink[];
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onAdd: (id: string, kind: Kind) => void;
}) {
  const { t } = useTranslation();
  const { me } = useWorkspace();
  const taskInput = useId();
  const kindInput = useId();
  const tasks = useTasks(task.workspaceId);
  const [toTaskId, setToTaskId] = useState("");
  const [kind, setKind] = useState<Kind>("related");
  const linked = new Set(
    links.filter((link) => link.kind === kind).map((link) => link.otherTaskId),
  );
  const options = (tasks.data ?? []).filter(
    (candidate) =>
      candidate.id !== task.id &&
      !candidate.id.startsWith("optimistic:") &&
      !linked.has(candidate.id),
  );
  const selected = options.find((candidate) => candidate.id === toTaskId);
  const access = useTaskAccess(toTaskId, !!selected);
  const problem = error ?? tasks.error ?? access.error;
  const canAdd =
    tasks.isSuccess && !!selected && access.isSuccess && access.data.canEdit;
  const workspace = me.workspaces.find(
    (entry) => entry.id === task.workspaceId,
  );
  return (
    <SheetDialog title={t("taskLinks.add")} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canAdd && !pending) onAdd(toTaskId, kind);
        }}
      >
        <div className="field">
          <Label htmlFor={kindInput}>{t("taskLinks.kindLabel")}</Label>
          <select
            id={kindInput}
            value={kind}
            onChange={(event) => {
              const next = taskLinkKinds.find(
                (value) => value === event.target.value,
              );
              if (next) {
                setKind(next);
                setToTaskId("");
              }
            }}
          >
            {taskLinkKinds.map((value) => (
              <option key={value} value={value}>
                {t(`taskLinks.kind.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={taskInput}>{t("taskLinks.task")}</Label>
          <select
            id={taskInput}
            value={selected?.id ?? ""}
            disabled={!tasks.isSuccess || !options.length}
            onChange={(event) => setToTaskId(event.target.value)}
          >
            <option value="">{t("taskLinks.choose")}</option>
            {options.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {workspace
                  ? `${taskReference(workspace.key, candidate.number)} · ${candidate.title}`
                  : candidate.title}
              </option>
            ))}
          </select>
        </div>
        {tasks.isSuccess && !options.length && (
          <p className="section-hint">{t("taskLinks.noneAvailable")}</p>
        )}
        {(problem ||
          (selected && access.isSuccess && !access.data.canEdit)) && (
          <p className="alert" role="alert">
            {t(problem ? errorKey(problem) : "errors.forbidden")}
          </p>
        )}
        <div className="action-row">
          <Button type="button" onClick={onClose}>
            {t("planning.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            disabled={!canAdd || pending}
          >
            {t(pending ? "working" : "taskLinks.add")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
