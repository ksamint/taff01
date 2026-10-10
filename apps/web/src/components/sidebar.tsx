"use client";

import {
  type PrototypeLocale,
  presentPrototypeField,
} from "@taff/schemas/prototype-data";

import {
  CalendarDays,
  ChevronDown,
  Search,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useInbox, useMembers, useRuns, useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

// Prototype desktop sidebar, lines 940–953; counts and status come from the API.
export function Sidebar() {
  const { me, workspace, setWorkspaceId, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  const pathname = usePathname();
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const tasks = useTasks(workspace.id);
  const inbox = useInbox(workspace.id);
  const projects = new Set(
    tasks.data?.flatMap((task) => (task.projectId ? [task.projectId] : [])),
  );
  return (
    <aside className="sidebar">
      <details className="sidebar-workspace">
        <summary>
          <span className="workspace-mark" aria-hidden="true">
            {workspace.name.slice(0, 1)}
          </span>
          <span>
            {presentPrototypeField(
              workspace.id,
              "name",
              workspace.name,
              locale,
            )}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="workspace-menu">
          {me.workspaces.map((item) => (
            <Button
              key={item.id}
              className="button-quiet"
              aria-pressed={workspace.id === item.id}
              onClick={(event) => {
                setWorkspaceId(item.id);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              {presentPrototypeField(item.id, "name", item.name, locale)}
            </Button>
          ))}
          <Link className="sidebar-link" href="/orgs">
            {t("organization.title")}
          </Link>
        </div>
      </details>
      <Button
        className="sidebar-search"
        data-testid="sidebar-search"
        onClick={openSearch}
      >
        <Search size={14} aria-hidden="true" />
        {t("search.title")}
        <kbd>⌘K</kbd>
      </Button>
      <nav className="sidebar-primary" aria-label={t("nav.label")}>
        {(
          [
            ["/projects", "projects", projects.size],
            ["/inbox", "inbox", inbox.data?.unreadCount ?? 0],
          ] as const
        ).map(([href, key, count]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="sidebar-link"
            aria-current={pathname.startsWith(href) ? "page" : undefined}
          >
            <span className="sidebar-nav-mark" aria-hidden="true" />
            <span>{t(`nav.${key}`)}</span>
            <span className="sidebar-count">{count}</span>
          </Link>
        ))}
      </nav>
      <section className="sidebar-agents" aria-label={t("agentProfile.team")}>
        <h2>{t("agentProfile.team")}</h2>
        {members.data
          ?.filter((member) => member.kind === "agent")
          .map((agent) => {
            const run = runs.data
              ?.filter((item) => item.agentId === agent.id)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            return (
              <Link
                key={agent.id}
                className="sidebar-link"
                href={`/agents/${agent.id}`}
                prefetch={false}
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>
                  {presentPrototypeField(agent.id, "name", agent.name, locale)}
                </span>
                <span
                  className={`agent-status-dot${run ? ` agent-status-${run.status}` : ""}`}
                  aria-label={
                    run ? t(`run.status.${run.status}`) : t("agentsIdle")
                  }
                />
              </Link>
            );
          })}
      </section>
      <nav className="sidebar-utilities" aria-label={t("me.preferences")}>
        {(
          [
            ["/", "today", Sun],
            ["/calendar", "calendar", CalendarDays],
            ["/me", "me", User],
          ] as const
        ).map(([href, key, Icon]) => (
          <Link
            key={href}
            className="sidebar-link"
            href={href}
            prefetch={false}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{t(`nav.${key}`)}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
