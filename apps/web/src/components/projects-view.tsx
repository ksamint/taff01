"use client";

import type { Task } from "@taff/schemas";
import { useTranslation } from "react-i18next";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { TaskRow } from "./task-row";

const STATUSES: Task["status"][] = [
  "todo",
  "in_progress",
  "needs_review",
  "done",
];

export function ProjectsView() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const tasks = useTasks(workspace.id);
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("projects.title")}</h1>
        <p className="task-count">{t("projects.board")}</p>
      </section>
      {tasks.isPending ? (
        <p className="loading" aria-live="polite">
          {t("loading")}
        </p>
      ) : (
        <div className="board">
          {STATUSES.map((status) => {
            const column = (tasks.data ?? []).filter(
              (task) => task.status === status,
            );
            return (
              <section
                key={status}
                className="column"
                aria-label={t(`status.${status}`)}
              >
                <h2>
                  {t(`status.${status}`)}
                  <span className="count-badge">{column.length}</span>
                </h2>
                {column.length === 0 ? (
                  <p className="section-hint">{t("projects.empty")}</p>
                ) : (
                  <ul className="task-list">
                    {column.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
