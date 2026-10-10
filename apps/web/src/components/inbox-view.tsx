"use client";

import {
  type Inbox,
  type InboxItem,
  type InboxItemInput,
  inboxItemInputSchema,
} from "@taff/schemas";
import {
  calendarCivilTime,
  calendarWallToInstant,
} from "@taff/schemas/calendar-read";
import {
  type PrototypeLocale,
  presentPrototypeField,
  prototypeTaskReference,
} from "@taff/schemas/prototype-data";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Bell, Check, Eye, EyeOff, Search, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import {
  inboxFromItems,
  m3MutationKey,
  snapshotM3,
} from "../lib/optimistic-m3";
import {
  inboxKey,
  useInbox,
  useMembers,
  useRuns,
  useTasks,
} from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

const TaskDetailView = dynamic(
  () => import("./task-detail-view").then((module) => module.TaskDetailView),
  { ssr: false },
);
type Tab = "all" | "reviews" | "blockers";
type Selection = { workspaceId: string; taskId: string };
type Update = {
  id: string;
  body: InboxItemInput;
  snooze?: InboxItem;
  undo?: boolean;
};

// Prototype phone 280–322 and desktop 1001–1020, sharing actual task/review panes.
export function InboxView() {
  const { me, workspace, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const inbox = useInbox(workspace.id);
  const tasks = useTasks(workspace.id);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const client = useQueryClient();
  const pending = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [markingAll, setMarkingAll] = useState(false);
  const busy = pending || markingAll;
  const [tab, setTab] = useState<Tab>("all");
  const [snoozed, setSnoozed] = useState<InboxItem | null>(null);
  const activeSnoozed = snoozed?.workspaceId === workspace.id ? snoozed : null;
  const [selected, setSelected] = useState<Selection | null | undefined>();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const update = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, body }: Update) =>
      request(`/api/inbox/${id}`, {
        method: "PATCH",
        body: JSON.stringify(inboxItemInputSchema.parse(body)),
      }),
    onMutate: async ({ id, body, undo }) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<Inbox>(inboxKey(workspace.id), (current) => {
        if (!current) return current;
        const items =
          undo && activeSnoozed && !current.items.some((item) => item.id === id)
            ? [activeSnoozed, ...current.items]
            : current.items;
        return inboxFromItems(
          items.map((item) =>
            item.id !== id
              ? item
              : {
                  ...item,
                  ...(body.read === undefined
                    ? {}
                    : { readAt: body.read ? new Date().toISOString() : null }),
                  ...(body.snoozedUntil === undefined
                    ? {}
                    : { snoozedUntil: body.snoozedUntil }),
                },
          ),
        );
      });
      return snapshot;
    },
    onSuccess: (_, input, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      if (input.snooze) setSnoozed(input.snooze);
      else if (input.undo) setSnoozed(null);
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
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
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  const { when, numbers } = useMemo(
    () => ({
      when: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      numbers: new Intl.NumberFormat(locale),
    }),
    [locale, me.user.tz],
  );
  const counts = {
    all: inbox.data?.items.length ?? 0,
    reviews: inbox.data?.reviewCount ?? 0,
    blockers: inbox.data?.blockerCount ?? 0,
  };
  const first = groups
    .flatMap((group) => group.items)
    .find((item) => item.taskId);
  const selection =
    selected === undefined ||
    (selected && selected.workspaceId !== workspace.id)
      ? first?.taskId
        ? {
            workspaceId: workspace.id,
            taskId: first.taskId,
          }
        : null
      : selected;
  const readError = inbox.error ?? tasks.error ?? members.error ?? runs.error;
  async function markAll() {
    setMarkingAll(true);
    try {
      // Each existing endpoint commits independently; previous successes remain
      // read if a later request fails, rather than implying a bulk transaction.
      for (const item of inbox.data?.items.filter((entry) => !entry.readAt) ??
        []) {
        await update.mutateAsync({ id: item.id, body: { read: true } });
      }
    } catch {
      // The mutation's localized error and rollback remain visible.
    } finally {
      setMarkingAll(false);
    }
  }
  function open(event: MouseEvent<HTMLAnchorElement>, item: InboxItem) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (desktop && item.taskId && !item.digestId) {
      event.preventDefault();
      setSelected({ workspaceId: workspace.id, taskId: item.taskId });
    }
    if (!busy && !item.readAt)
      update.mutate({ id: item.id, body: { read: true } });
  }
  function tomorrow() {
    const next = calendarCivilTime(new Date(), me.user.tz);
    next.setUTCDate(next.getUTCDate() + 1);
    return calendarWallToInstant(
      `${next.toISOString().slice(0, 10)}T00:00`,
      me.user.tz,
    );
  }
  return (
    <div
      className={`inbox-view${desktop && selection ? " inbox-with-detail" : ""}`}
    >
      <div className="inbox-main">
        <header className="inbox-header">
          <h1>{t("inbox.title")}</h1>
          <div className="inbox-header-actions">
            {!!inbox.data?.unreadCount && (
              <Button
                className="button-quiet inbox-mark-all"
                data-testid="inbox-mark-all"
                disabled={busy}
                onClick={() => void markAll()}
              >
                {t("inbox.markAllRead")}
              </Button>
            )}
            <Button
              className="button-quiet inbox-search"
              aria-label={t("search.title")}
              data-testid="open-search"
              onClick={openSearch}
            >
              <Search size={20} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div
          className="inbox-source-tabs"
          role="group"
          aria-label={t("inbox.title")}
        >
          {(["all", "reviews", "blockers"] as const).map((item) => (
            <Button
              key={item}
              className="button-quiet"
              aria-pressed={tab === item}
              data-testid={`inbox-tab-${item}`}
              onClick={() => setTab(item)}
            >
              {t(`inbox.${item}`)}
              <span>{numbers.format(counts[item])}</span>
            </Button>
          ))}
        </div>
        {activeSnoozed && (
          <div className="inbox-notice" role="status">
            {t("inbox.snoozedTomorrow")}
            <Button
              className="button-quiet"
              disabled={busy}
              onClick={() =>
                update.mutate({
                  id: activeSnoozed.id,
                  body: { snoozedUntil: null, read: !!activeSnoozed.readAt },
                  undo: true,
                })
              }
            >
              {t("inbox.undo")}
            </Button>
          </div>
        )}
        {update.isError && (
          <p className="inbox-message alert" role="alert">
            {t(errorKey(update.error))}
          </p>
        )}
        {readError && (
          <div className="inbox-message">
            <p className="alert" role="alert">
              {t(errorKey(readError))}
            </p>
            <Button
              className="button-quiet"
              onClick={() => {
                void inbox.refetch();
                void tasks.refetch();
                void members.refetch();
                void runs.refetch();
              }}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        {inbox.isPending ? (
          <p className="inbox-message quiet" aria-live="polite">
            {t("loading")}
          </p>
        ) : !inbox.isError && groups.length === 0 ? (
          <div className="inbox-source-empty">
            <span className="inbox-empty-ring" aria-hidden="true">
              <span>
                <span />
              </span>
            </span>
            <h2>{t("inbox.zero")}</h2>
            <p>{t("inbox.zeroSub")}</p>
          </div>
        ) : (
          <div className="inbox-source-groups">
            {groups.map((group) => (
              <section
                key={group.taskId ?? "workspace"}
                className="inbox-source-group"
                aria-label={
                  group.taskId
                    ? t("inbox.taskGroup")
                    : t("inbox.workspaceGroup")
                }
              >
                <ul>
                  {group.items.map((item) => {
                    const task = tasks.data?.find(
                      (entry) => entry.id === item.taskId,
                    );
                    const agent = members.data?.find(
                      (entry) => entry.id === item.agentId,
                    );
                    const owner = members.data?.find(
                      (entry) => entry.id === task?.ownerId,
                    );
                    const person = agent ?? owner;
                    const name = person
                      ? presentPrototypeField(
                          person.id,
                          "name",
                          person.name,
                          locale,
                        )
                      : t(
                          item.digestId
                            ? "notifications.title"
                            : "unknownMember",
                        );
                    const title = task
                      ? presentPrototypeField(
                          task.id,
                          "title",
                          task.title,
                          locale,
                        )
                      : item.title;
                    const run = runs.data?.find(
                      (entry) => entry.id === item.runId,
                    );
                    const excerpt =
                      item.kind === "blocker"
                        ? item.title
                        : run?.summary ||
                          (task
                            ? presentPrototypeField(
                                task.id,
                                "description",
                                task.description,
                                locale,
                              )
                            : item.title);
                    const reference = task
                      ? (prototypeTaskReference(task.id) ?? task.id.slice(0, 8))
                      : null;
                    const href = item.digestId
                      ? `/digests/${item.digestId}`
                      : item.taskId
                        ? `/tasks/${item.taskId}${item.kind === "review" ? "/review" : ""}`
                        : null;
                    const selectedRow =
                      desktop && selection?.taskId === item.taskId;
                    return (
                      <li
                        key={item.id}
                        className={`inbox-source-row${item.readAt ? "" : " is-unread"}${selectedRow ? " is-selected" : ""}`}
                        data-testid="inbox-item"
                        data-kind={item.kind}
                      >
                        {!item.readAt && (
                          <span
                            className="inbox-unread-dot"
                            aria-label={t("inbox.unread", { count: 1 })}
                          />
                        )}
                        <span
                          className={`inbox-source-avatar${agent ? " is-agent" : ""}`}
                          aria-hidden="true"
                        >
                          {agent ? (
                            <Sparkles size={16} strokeWidth={1.5} />
                          ) : item.digestId ? (
                            <Bell size={16} strokeWidth={1.5} />
                          ) : (
                            name.slice(0, 1)
                          )}
                        </span>
                        <div className="inbox-source-content">
                          <div className="inbox-source-meta">
                            <span>
                              <strong>{name}</strong>{" "}
                              {t(`inbox.kind.${item.kind}`)} ·{" "}
                              <time dateTime={item.createdAt}>
                                {when.format(new Date(item.createdAt))}
                              </time>
                            </span>
                            <span
                              className={`inbox-source-status inbox-source-${item.kind}`}
                            >
                              {t(`inbox.kind.${item.kind}`)}
                            </span>
                          </div>
                          {href ? (
                            <Link
                              className="inbox-source-title"
                              href={href}
                              prefetch={false}
                              onClick={(event) => open(event, item)}
                            >
                              {reference && <span>{reference}</span>}
                              {title}
                            </Link>
                          ) : (
                            <p className="inbox-source-title">{title}</p>
                          )}
                          {excerpt && (
                            <p className="inbox-source-excerpt">{excerpt}</p>
                          )}
                          <div className="inbox-source-actions">
                            {item.kind === "review" && href && (
                              <Link
                                className="button button-primary"
                                href={href}
                                prefetch={false}
                                data-testid="inbox-approve"
                                aria-label={`${t("review.approve")} · ${t("review.open")}`}
                                onClick={(event) => open(event, item)}
                              >
                                <Check
                                  size={14}
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                />
                                {t("review.approve")}
                              </Link>
                            )}
                            {item.kind === "blocker" && item.agentId && (
                              <Link
                                className="button button-primary"
                                data-testid="inbox-grant-access"
                                href={`/agents/${item.agentId}`}
                                prefetch={false}
                              >
                                <Sparkles
                                  size={14}
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                />
                                {t("inbox.grantAccess")}
                              </Link>
                            )}
                            {href && (
                              <Link
                                className="button button-quiet"
                                href={href}
                                prefetch={false}
                                data-testid={
                                  item.digestId
                                    ? "inbox-open-digest"
                                    : item.kind === "review"
                                      ? "inbox-open-review"
                                      : "inbox-open-task"
                                }
                                onClick={(event) => open(event, item)}
                              >
                                {t(
                                  item.digestId
                                    ? "notifications.openDigest"
                                    : "inbox.view",
                                )}
                              </Link>
                            )}
                            <span className="inbox-action-spacer" />
                            <Button
                              className="button-quiet inbox-read-toggle"
                              disabled={busy}
                              aria-label={t(
                                item.readAt
                                  ? "inbox.markUnread"
                                  : "inbox.markRead",
                              )}
                              title={t(
                                item.readAt
                                  ? "inbox.markUnread"
                                  : "inbox.markRead",
                              )}
                              onClick={() =>
                                update.mutate({
                                  id: item.id,
                                  body: { read: !item.readAt },
                                })
                              }
                            >
                              {item.readAt ? (
                                <EyeOff
                                  size={14}
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Eye
                                  size={14}
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                />
                              )}
                            </Button>
                            <Button
                              className="button-quiet inbox-snooze"
                              data-testid="inbox-snooze"
                              disabled={busy}
                              onClick={() =>
                                update.mutate({
                                  id: item.id,
                                  body: {
                                    read: true,
                                    snoozedUntil: tomorrow(),
                                  },
                                  snooze: item,
                                })
                              }
                            >
                              {t("inbox.tomorrow")}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      {desktop && selection && (
        <aside className="inbox-detail-pane" aria-label={t("inbox.taskGroup")}>
          <TaskDetailView
            key={selection.taskId}
            taskId={selection.taskId}
            embedded
            onClose={() => setSelected(null)}
          />
        </aside>
      )}
    </div>
  );
}
