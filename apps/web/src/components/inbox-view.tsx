"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { TaskRow } from "./task-row";

type Tab = "all" | "reviews" | "blockers";

export function InboxView() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const tasks = useTasks(workspace.id);
  const [tab, setTab] = useState<Tab>("all");
  const reviews = (tasks.data ?? []).filter(
    (task) => task.status === "needs_review",
  );
  const items = tab === "blockers" ? [] : reviews;
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("inbox.title")}</h1>
        <p className="task-count">
          {t("inbox.needsReview", { count: reviews.length })}
        </p>
      </section>
      <div className="segmented" role="group" aria-label={t("inbox.title")}>
        {(["all", "reviews", "blockers"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {t(`inbox.${item}`)}
          </button>
        ))}
      </div>
      {tasks.isPending ? (
        <p className="loading" aria-live="polite">
          {t("loading")}
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            ✓
          </span>
          <h3>{t("inbox.zero")}</h3>
          <p>{t("inbox.zeroSub")}</p>
        </div>
      ) : (
        <ul className="task-list">
          {items.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </>
  );
}
