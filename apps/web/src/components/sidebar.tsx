"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  Contact,
  KanbanSquare,
  PanelLeft,
  Search,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceAccess } from "../lib/queries";
import { InboxBadge, useWorkspace } from "./app-shell";
import { OrganizationChooser } from "./organization-chooser";

const NAV = [
  { href: "/", key: "today", Icon: Sun },
  { href: "/calendar", key: "calendar", Icon: CalendarDays },
  { href: "/projects", key: "projects", Icon: KanbanSquare },
] as const;
const ME_PATHS = ["/me", "/inbox", "/agents", "/orgs", "/digests"];
/** 公司 · 聯繫人, indented under 項目 for people who can read the CRM. */
const CRM_NAV = [
  { href: "/companies", key: "companies", Icon: Building2 },
  { href: "/contacts", key: "contacts", Icon: Contact },
] as const;
const foldKey = (userId: string) => `taff:sidebar-folded:${userId}`;

/** Fold state is remembered per person on this device. */
function useFolded(userId: string) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(window.localStorage.getItem(foldKey(userId)) === "1");
    } catch {
      /* Storage can be blocked; the sidebar then starts open. */
    }
  }, [userId]);
  const toggle = () =>
    setFolded((current) => {
      try {
        window.localStorage.setItem(foldKey(userId), current ? "0" : "1");
      } catch {
        /* The choice still applies to this page. */
      }
      return !current;
    });
  return [folded, toggle] as const;
}

// Prototype v2 desktop sidebar (lines 1185–1218) and its folded rail.
export function Sidebar() {
  const { me, workspace, setWorkspaceId, openSearch } = useWorkspace();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [folded, toggle] = useFolded(me.user.id);
  const crm = !!useWorkspaceAccess(workspace.id).data?.canReadCrm;
  const role = me.workspaces.find((item) => item.id === workspace.id)?.role;
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const meActive = ME_PATHS.some((path) => pathname.startsWith(path));
  return (
    <aside
      className={`sidebar${folded ? " sidebar-folded" : ""}`}
      data-testid="sidebar"
      data-folded={folded ? "true" : "false"}
    >
      <div className="sidebar-top">
        <details className="sidebar-workspace">
          <summary
            aria-label={folded ? workspace.name : undefined}
            title={folded ? workspace.name : undefined}
          >
            <span className="workspace-mark" aria-hidden="true">
              {workspace.name.slice(0, 1)}
            </span>
            {!folded && <span>{workspace.name}</span>}
            {!folded && <ChevronDown size={14} aria-hidden="true" />}
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
        {!folded && (
          <button
            type="button"
            className="sidebar-fold"
            data-testid="sidebar-fold"
            aria-label={t("nav.fold")}
            title={t("nav.fold")}
            aria-expanded="true"
            onClick={toggle}
          >
            <PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>
      <button
        type="button"
        className="sidebar-search"
        data-testid="sidebar-search"
        aria-label={folded ? t("search.title") : undefined}
        title={folded ? `${t("search.title")} ⌘K` : undefined}
        onClick={openSearch}
      >
        <Search size={14} aria-hidden="true" />
        {!folded && (
          <>
            <span>{t("search.title")}</span>
            <kbd>⌘K</kbd>
          </>
        )}
      </button>
      <nav className="sidebar-primary" aria-label={t("nav.label")}>
        {NAV.map(({ href, key, Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="sidebar-link"
            aria-current={active(href) ? "page" : undefined}
            aria-label={folded ? t(`nav.${key}`) : undefined}
            title={folded ? t(`nav.${key}`) : undefined}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            {!folded && <span>{t(`nav.${key}`)}</span>}
          </Link>
        ))}
        {crm &&
          CRM_NAV.map(({ href, key, Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="sidebar-link sidebar-sublink"
              data-testid={`sidebar-${key}`}
              aria-current={active(href) ? "page" : undefined}
              aria-label={folded ? t(`crm.${key}.title`) : undefined}
              title={folded ? t(`crm.${key}.title`) : undefined}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              {!folded && <span>{t(`crm.${key}.title`)}</span>}
            </Link>
          ))}
      </nav>
      <span className="sidebar-spacer" />
      {folded && (
        <button
          type="button"
          className="sidebar-fold"
          data-testid="sidebar-fold"
          aria-label={t("nav.unfold")}
          title={t("nav.unfold")}
          aria-expanded="false"
          onClick={toggle}
        >
          <PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <Link
        href="/me"
        prefetch={false}
        className="sidebar-me"
        data-testid="sidebar-me"
        aria-current={meActive ? "page" : undefined}
        aria-label={folded ? t("nav.me") : undefined}
        title={folded ? me.user.name : undefined}
      >
        <span className="sidebar-avatar" aria-hidden="true">
          {me.user.name.slice(0, 1)}
        </span>
        {!folded && (
          <span className="sidebar-me-copy">
            <span className="sidebar-me-name">{me.user.name}</span>
            <span className="sidebar-me-role">
              {role ? t(`organization.${role}`) : ""}
            </span>
          </span>
        )}
        <InboxBadge workspaceId={workspace.id} />
      </Link>
    </aside>
  );
}
