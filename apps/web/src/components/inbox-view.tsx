"use client";

import {
  type InboxItem,
  type InboxItemInput,
  inboxItemInputSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Clock, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3, useInbox } from "../lib/m3-queries";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

type Tab = "all" | "reviews" | "blockers";

export function InboxView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const inbox = useInbox(workspace.id);
  const tasks = useTasks(workspace.id);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [snoozed, setSnoozed] = useState<InboxItem | null>(null);
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: InboxItemInput }) =>
      request(`/api/inbox/${id}`, {
        method: "PATCH",
        body: JSON.stringify(inboxItemInputSchema.parse(body)),
      }),
    onSettled: () => invalidateM3(client),
  });
  const groups = (inbox.data?.groups ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          tab === "all" ||
          item.kind === (tab === "reviews" ? "review" : "blocker"),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage ?? me.user.locale, {
      timeZone: me.user.tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const counts = {
    all: inbox.data?.items.length ?? 0,
    reviews: inbox.data?.reviewCount ?? 0,
    blockers: inbox.data?.blockerCount ?? 0,
  };
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("inbox.title")}</h1>
        <p className="task-count">
          {t("inbox.unread", { count: inbox.data?.unreadCount ?? 0 })}
        </p>
      </section>
      <div
        className="segmented inbox-tabs"
        role="group"
        aria-label={t("inbox.title")}
      >
        {(["all", "reviews", "blockers"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            data-testid={`inbox-tab-${item}`}
            onClick={() => setTab(item)}
          >
            {t(`inbox.${item}`)}{" "}
            <span>
              {new Intl.NumberFormat(i18n.resolvedLanguage).format(
                counts[item],
              )}
            </span>
          </button>
        ))}
      </div>
      {snoozed && (
        <div className="inbox-notice" role="status">
          {t("inbox.snoozed")}{" "}
          <Button
            className="button-quiet"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: snoozed.id,
                  body: { snoozedUntil: null, read: !!snoozed.readAt },
                },
                { onSuccess: () => setSnoozed(null) },
              )
            }
          >
            {t("inbox.undo")}
          </Button>
        </div>
      )}
      {update.isError && (
        <p className="alert" role="alert">
          {t(errorKey(update.error))}
        </p>
      )}
      {inbox.isPending ? (
        <p className="loading" aria-live="polite">
          {t("loading")}
        </p>
      ) : inbox.isError ? (
        <div>
          <p className="alert" role="alert">
            {t(errorKey(inbox.error))}
          </p>
          <Button onClick={() => void inbox.refetch()}>{t("retry")}</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <Bell size={24} aria-hidden="true" />
          <h3>{t("inbox.zero")}</h3>
          <p>{t("inbox.zeroSub")}</p>
        </div>
      ) : (
        <div className="inbox-groups">
          {groups.map((group) => (
            <section key={group.taskId ?? "workspace"} className="inbox-group">
              <h2>
                {group.taskId
                  ? (tasks.data?.find((task) => task.id === group.taskId)
                      ?.title ?? t("inbox.taskGroup"))
                  : t("inbox.workspaceGroup")}
              </h2>
              <ul className="task-list">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={`inbox-card ${item.readAt ? "" : "is-unread"}`}
                    data-testid="inbox-item"
                    data-kind={item.kind}
                  >
                    <div className="section-heading">
                      <span
                        className={`status ${item.kind === "review" ? "status-needs_review" : item.kind === "blocker" ? "status-blocker" : ""}`}
                      >
                        {t(`inbox.kind.${item.kind}`)}
                      </span>
                      <time dateTime={item.createdAt}>
                        {when(item.createdAt)}
                      </time>
                    </div>
                    <h3>{item.title}</h3>
                    <div className="action-row">
                      {item.taskId && (
                        <Link
                          className="button button-primary"
                          data-testid={
                            item.kind === "review"
                              ? "inbox-open-review"
                              : "inbox-open-task"
                          }
                          href={`/tasks/${item.taskId}${item.kind === "review" ? "/review" : ""}`}
                          onClick={() =>
                            update.mutate({ id: item.id, body: { read: true } })
                          }
                        >
                          <ArrowUpRight size={14} aria-hidden="true" />
                          {t(
                            item.kind === "review"
                              ? "review.open"
                              : "inbox.openTask",
                          )}
                        </Link>
                      )}
                      {item.kind === "blocker" && item.agentId && (
                        <Link
                          className="button"
                          data-testid="inbox-grant-access"
                          href={`/agents/${item.agentId}`}
                        >
                          <Sparkles size={14} aria-hidden="true" />
                          {t("inbox.grantAccess")}
                        </Link>
                      )}
                      <Button
                        className="button-quiet"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: item.id,
                            body: { read: !!!item.readAt },
                          })
                        }
                      >
                        {item.readAt ? (
                          <EyeOff size={14} aria-hidden="true" />
                        ) : (
                          <Eye size={14} aria-hidden="true" />
                        )}
                        {t(item.readAt ? "inbox.markUnread" : "inbox.markRead")}
                      </Button>
                      <Button
                        data-testid="inbox-snooze"
                        className="button-quiet"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate(
                            {
                              id: item.id,
                              body: {
                                read: true,
                                snoozedUntil: new Date(
                                  Date.now() + 86_400_000,
                                ).toISOString(),
                              },
                            },
                            { onSuccess: () => setSnoozed(item) },
                          )
                        }
                      >
                        <Clock size={14} aria-hidden="true" />
                        {t("inbox.snoozeDay")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
