"use client";

import type { Task } from "@taff/schemas";
import { useTranslation } from "react-i18next";
import { useMembers } from "../lib/queries";
import { useWorkspace } from "./app-shell";

export function TaskRow({
  task,
  showTime,
}: {
  task: Task;
  showTime?: boolean;
}) {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const members = useMembers(workspace.id);
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const owner =
    members.data?.find((member) => member.id === task.ownerId)?.name ??
    t("unknownMember");
  return (
    <li className="task-card">
      <div className="task-card-top">
        <span className={`status status-${task.status}`}>
          {t(`status.${task.status}`)}
        </span>
        {showTime && task.dueAt && (
          <span className="task-due">
            {new Intl.DateTimeFormat(locale, {
              timeZone: me.user.tz,
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(task.dueAt))}
          </span>
        )}
      </div>
      <h3>{task.title}</h3>
      <p className="task-owner">{t("ownedBy", { name: owner })}</p>
    </li>
  );
}
