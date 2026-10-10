"use client";
import type { Locale } from "@taff/schemas";

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
import { OrganizationChooser } from "./organization-chooser";
import { Button } from "./ui/button";

// Prototype desktop sidebar, lines 940–953; counts and status come from the API.
export function Sidebar() {
  const { me, workspace, setWorkspaceId, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const pathname = usePathname();
  const workspaceName = workspace.name;
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
            {workspaceName.slice(0, 1)}
          </span>
          <span>{workspaceName}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="workspace-menu">
          <OrganizationChooser
            heading
            onSelect={(id, event) => {
              setWorkspaceId(id);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          />
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
                <span>{agent.name}</span>
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
