"use client";
import "../styles/inbox.css";

import { type InboxItem, type Locale, taskReference } from "@taff/schemas";
import {
  calendarCivilTime,
  calendarWallToInstant,
} from "@taff/schemas/calendar-read";
import { useIsMutating } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Check,
  Eye,
  EyeOff,
  Lock,
  Search,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useUpdateInboxItem } from "../lib/mutations/inbox";
import { needsYouItems } from "../lib/needs-you";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useInbox, useMembers, useRuns, useTasks } from "../lib/queries";
import { showToast } from "../lib/toast";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const TaskDetailView = dynamic(
  () => import("./task-detail-view").then((module) => module.TaskDetailView),
  { ssr: false },
);
type Tab = "all" | "reviews" | "blockers" | "snoozed";
type Selection = { workspaceId: string; taskId: string };
const TABS: Tab[] = ["all", "reviews", "blockers"];

/**
 * Prototype v2 Inbox: the phone pushed screen (lines 371–412) and the
 * desktop Me › 收件箱 tab (lines 1444–1468). On desktop `/inbox` opens the
 * tab, so the inbox has one home per layout.
 */
export function InboxView({ embedded = false }: { embedded?: boolean }) {
  const desktop = useDesktop();
  const router = useRouter();
  useEffect(() => {
    if (desktop && !embedded) router.replace("/me?tab=inbox");
  }, [desktop, embedded, router]);
  if (desktop && !embedded) return null;
  return <InboxScreen embedded={embedded} desktop={desktop} />;
}

function InboxScreen({
  embedded,
  desktop,
}: {
  embedded: boolean;
  desktop: boolean;
}) {
  const { me, workspace, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("all");
  const snoozedView = desktop && embedded && tab === "snoozed";
  const inbox = useInbox(workspace.id, snoozedView);
  const tasks = useTasks(workspace.id);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const pending = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [markingAll, setMarkingAll] = useState(false);
  const busy = pending || markingAll;
  const [snoozed, setSnoozed] = useState<InboxItem | null>(null);
  const activeSnoozed = snoozed?.workspaceId === workspace.id ? snoozed : null;
  const [selected, setSelected] = useState<Selection | null | undefined>();
  const update = useUpdateInboxItem(workspace.id, {
    snoozed: activeSnoozed,
    onSnoozedChange: (item) => {
      setSnoozed(item);
      // Undo calls the inverse API operation, never a cache snapshot.
      if (item)
        showToast(t("inbox.snoozedTomorrow"), {
          label: t("inbox.undo"),
          run: () =>
            update.mutate({
              id: item.id,
              body: { snoozedUntil: null, read: !!item.readAt },
              undo: true,
            }),
        });
    },
  });
  // One rule everywhere (plan §2.4 item 1): the review and blocker tabs hold
  // the unresolved items that count; mentions and history stay in 全部.
  const needsYou = needsYouItems(inbox.data);
  const reviews = needsYou.filter((item) => item.kind === "review");
  const blockers = needsYou.filter((item) => item.kind === "blocker");
  const visible = new Set(
    (tab === "all" || tab === "snoozed"
      ? (inbox.data?.items ?? [])
      : tab === "reviews"
        ? reviews
        : blockers
    ).map((item) => item.id),
  );
  const groups = (inbox.data?.groups ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => visible.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const { when, numbers, day } = useMemo(
    () => ({
      when: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      numbers: new Intl.NumberFormat(locale),
      day: new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: "UTC",
      }),
    }),
    [locale, me.user.tz],
  );
  const counts = {
    all: inbox.data?.items.length ?? 0,
    reviews: reviews.length,
    blockers: blockers.length,
    snoozed: inbox.data?.items.length ?? 0,
  };
  const first = groups
    .flatMap((group) => group.items)
    .find((item) => item.taskId);
  const selection =
    selected === undefined ||
    (selected && selected.workspaceId !== workspace.id)
      ? first?.taskId
        ? { workspaceId: workspace.id, taskId: first.taskId }
        : null
      : selected;
  const showDetail = desktop && embedded && !!selection;
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
    if (desktop && embedded && item.taskId && !item.digestId) {
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
  const markAllButton = !snoozedView && !!inbox.data?.unreadCount && (
    <Button
      className="button-quiet inbox-mark-all"
      data-testid="inbox-mark-all"
      disabled={busy}
      onClick={() => void markAll()}
    >
      {t("inbox.markAllRead")}
    </Button>
  );
  return (
    <div
      className={`inbox-view${embedded ? " is-embedded" : ""}${showDetail ? " inbox-with-detail" : ""}`}
    >
      <div className="inbox-main">
        {!embedded && (
          <header className="inbox-header">
            <span className="inbox-header-title">
              <Link
                className="inbox-back"
                href="/me"
                prefetch={false}
                aria-label={t("actions.back")}
                title={t("actions.back")}
                data-testid="inbox-back"
              >
                <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <h1>{t("inbox.title")}</h1>
            </span>
            <span className="inbox-header-actions">
              {markAllButton}
              <Button
                className="button-quiet inbox-icon-button"
                aria-label={t("search.title")}
                data-testid="open-search"
                onClick={openSearch}
              >
                <Search size={20} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </span>
          </header>
        )}
        <div className="inbox-tabs">
          <div
            className="inbox-tab-list"
            role="group"
            aria-label={t("inbox.title")}
          >
            {(desktop && embedded ? [...TABS, "snoozed" as const] : TABS).map(
              (item) => (
                <Button
                  key={item}
                  className="inbox-tab"
                  aria-pressed={tab === item}
                  data-testid={`inbox-tab-${item}`}
                  onClick={() => setTab(item)}
                >
                  {t(item === "snoozed" ? "me.snoozed" : `inbox.${item}`)}
                  {(item === "snoozed") === snoozedView && (
                    <span className="inbox-tab-count">
                      {numbers.format(counts[item])}
                    </span>
                  )}
                </Button>
              ),
            )}
          </div>
          {embedded && markAllButton}
        </div>
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
          <p className="inbox-message inbox-quiet" aria-live="polite">
            {t("loading")}
          </p>
        ) : !inbox.isError && groups.length === 0 ? (
          <div className="inbox-empty">
            <span className="inbox-empty-ring" aria-hidden="true">
              <span>
                <span />
              </span>
            </span>
            <h2>{t(snoozedView ? "me.noSnoozed" : "inbox.zero")}</h2>
            {!snoozedView && <p>{t("inbox.zeroSub")}</p>}
          </div>
        ) : (
          <div className="inbox-groups">
            {groups.map((group) => (
              <section
                key={group.taskId ?? "workspace"}
                aria-label={
                  group.taskId
                    ? t("inbox.taskGroup")
                    : t("inbox.workspaceGroup")
                }
              >
                <ul className="inbox-list">
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
                      ? person.name
                      : t(
                          item.digestId
                            ? "notifications.title"
                            : "unknownMember",
                        );
                    const digestDay =
                      item.digestId && /^\d{4}-\d{2}-\d{2}$/.test(item.title)
                        ? day.format(new Date(`${item.title}T00:00:00Z`))
                        : null;
                    const title = task
                      ? task.title
                      : digestDay
                        ? t("notifications.digestDay", { date: digestDay })
                        : item.title;
                    const run = runs.data?.find(
                      (entry) => entry.id === item.runId,
                    );
                    const excerpt =
                      item.kind === "blocker"
                        ? item.title
                        : digestDay
                          ? t("notifications.digestExcerpt")
                          : run?.summary ||
                            (task ? task.description : item.title);
                    const reference = task
                      ? taskReference(workspace.key, task.number)
                      : null;
                    const href = item.digestId
                      ? `/digests/${item.digestId}`
                      : item.taskId
                        ? `/tasks/${item.taskId}${item.kind === "review" ? "/review" : ""}`
                        : null;
                    const selectedRow =
                      showDetail && selection?.taskId === item.taskId;
                    return (
                      <li
                        key={item.id}
                        className={`inbox-row${item.readAt ? "" : " is-unread"}${selectedRow ? " is-selected" : ""}`}
                        data-testid="inbox-item"
                        data-kind={item.kind}
                      >
                        {!item.readAt && (
                          <span
                            className="inbox-unread-dot"
                            role="img"
                            aria-label={t("inbox.unread", { count: 1 })}
                          />
                        )}
                        <span
                          className={`inbox-avatar${agent ? " is-agent" : ""}`}
                          aria-hidden="true"
                        >
                          {agent ? (
                            <Sparkles size={16} strokeWidth={1.5} />
                          ) : item.digestId ? (
                            <Bell size={16} strokeWidth={1.5} />
                          ) : (
                            Array.from(name).slice(0, 1).join("")
                          )}
                        </span>
                        <div className="inbox-content">
                          <div className="inbox-meta">
                            <span>
                              <strong>{name}</strong>{" "}
                              {t(`inbox.kind.${item.kind}`)} ·{" "}
                              <time dateTime={item.createdAt}>
                                {when.format(new Date(item.createdAt))}
                              </time>
                            </span>
                            <Badge
                              className={`inbox-badge inbox-badge-${item.kind}`}
                            >
                              {t(`inbox.kind.${item.kind}`)}
                            </Badge>
                          </div>
                          {href ? (
                            <Link
                              className="inbox-source-title"
                              href={href}
                              prefetch={false}
                              onClick={(event) => open(event, item)}
                            >
                              {reference && (
                                <span className="inbox-ref">{reference}</span>
                              )}
                              {title}
                            </Link>
                          ) : (
                            <p className="inbox-source-title">{title}</p>
                          )}
                          {excerpt && (
                            <p className="inbox-excerpt">{excerpt}</p>
                          )}
                          {snoozedView && item.snoozedUntil && (
                            <p className="inbox-excerpt">
                              {t("me.snoozedUntil", {
                                date: new Intl.DateTimeFormat(locale, {
                                  timeZone: me.user.tz,
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(item.snoozedUntil)),
                              })}
                            </p>
                          )}
                          <div className="inbox-actions">
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
                                <Lock
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
                            <span className="inbox-action-end">
                              <Button
                                className="button-quiet inbox-icon-button"
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
                                    size={16}
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Eye
                                    size={16}
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                  />
                                )}
                              </Button>
                              <Button
                                className="button-quiet"
                                data-testid={
                                  snoozedView
                                    ? "inbox-unsnooze"
                                    : "inbox-snooze"
                                }
                                disabled={busy}
                                onClick={() =>
                                  update.mutate({
                                    id: item.id,
                                    body: {
                                      ...(snoozedView ? {} : { read: true }),
                                      snoozedUntil: snoozedView
                                        ? null
                                        : tomorrow(),
                                    },
                                    ...(snoozedView ? {} : { snooze: item }),
                                  })
                                }
                              >
                                {t(
                                  snoozedView
                                    ? "me.unsnooze"
                                    : "inbox.tomorrow",
                                )}
                              </Button>
                            </span>
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
      {showDetail && selection && (
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
