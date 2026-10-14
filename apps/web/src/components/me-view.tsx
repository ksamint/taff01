"use client";
import "../styles/me.css";

import { type Locale, taskReference } from "@taff/schemas";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Inbox,
  Languages,
  LogOut,
  Moon,
  Plug,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useBrief } from "../lib/brief-queries";
import { needsYouCount } from "../lib/needs-you";
import { useNotificationPreferences } from "../lib/notification-preferences";
import { useInbox, useMembers, useRuns, useTasks } from "../lib/queries";
import { applyTheme, readTheme, type ThemePreference } from "../lib/theme";
import { showToast } from "../lib/toast";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { EmailVerification } from "./email-verification";
import { OrganizationChooser } from "./organization-chooser";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const MeDesktop = dynamic(
  () => import("./me-desktop").then((module) => module.MeDesktop),
  { ssr: false, loading: () => null },
);

const LANGUAGES: Locale[] = ["en", "zh-HK", "zh-CN"];
const THEMES: ThemePreference[] = ["light", "dark", "system"];
const ACTIVE_RUNS = new Set(["running", "paused", "needs_review"]);

/** Every zone the browser knows, with the saved one first when it is unknown here. */
function timeZones(current: string): string[] {
  let known: string[] = [];
  try {
    known = Intl.supportedValuesOf("timeZone");
  } catch {
    known = ["UTC"];
  }
  return known.includes(current) ? known : [current, ...known];
}

export const initial = (name: string) =>
  Array.from(name.trim()).slice(0, 1).join("").toUpperCase();

/** The prototype's dot on AI 簡報: suggested actions wait for the reader. */
export function BriefDot() {
  const { t } = useTranslation();
  const brief = useBrief();
  const count = brief.data?.actions.length ?? 0;
  return count > 0 ? (
    <span
      className="me-brief-dot"
      role="img"
      aria-label={t("brief.actions.waiting", { count })}
      data-testid="brief-dot"
    />
  ) : null;
}

/** Phone (< 1024 px) renders the prototype's Me list; desktop renders tabs. */
export function MeView() {
  return useDesktop() ? <MeDesktop /> : <MePhone />;
}

export function useLocaleFormat() {
  const { me } = useWorkspace();
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  return { locale, numbers: new Intl.NumberFormat(locale) };
}

/** “3 people · 2 agents”, or the read error. */
export function useTeamSummary() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const { numbers } = useLocaleFormat();
  const members = useMembers(workspace.id);
  return members.data
    ? t("me.teamSummary", {
        people: numbers.format(
          members.data.filter((member) => member.kind === "person").length,
        ),
        agents: numbers.format(
          members.data.filter((member) => member.kind === "agent").length,
        ),
      })
    : members.error
      ? t(errorKey(members.error))
      : t("loading");
}

/** “2 on · Daily digest 18:00”, the notification row's summary line. */
export function useNotificationSummary() {
  const { t } = useTranslation();
  const preferences = useNotificationPreferences();
  const categories = ["review", "block", "mention", "done"] as const;
  if (!preferences.data)
    return preferences.error ? t(errorKey(preferences.error)) : t("loading");
  const active = categories.filter((key) => preferences.data?.[key]).length;
  return [
    active
      ? t("me.notificationSummary", { count: active })
      : t("me.notificationsOff"),
    preferences.data.digest
      ? t("me.digestSummary", { time: preferences.data.digestAt })
      : null,
    preferences.data.quiet ? t("notifications.quiet") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type AgentRow = {
  id: string;
  name: string;
  /** Run status of the agent's current work, or `idle`. */
  status: string;
  label: string;
  taskTitle: string | null;
  openTasks: number;
};

/** The workspace's agents with the status of their latest active run. */
export function useAgentRows(): {
  rows: AgentRow[];
  pending: boolean;
  error: unknown;
} {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const tasks = useTasks(workspace.id);
  const rows = (members.data ?? [])
    .filter((member) => member.kind === "agent")
    .map((agent) => {
      const current = (runs.data ?? [])
        .filter(
          (run) => run.agentId === agent.id && ACTIVE_RUNS.has(run.status),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const task = current
        ? tasks.data?.find((item) => item.id === current.taskId)
        : undefined;
      const status = current?.status ?? "idle";
      return {
        id: agent.id,
        name: agent.name,
        status,
        label: task
          ? `${t(`run.status.${status}`)} · ${taskReference(workspace.key, task.number)}`
          : t(`run.status.${status}`),
        taskTitle: task?.title ?? null,
        openTasks:
          tasks.data?.filter(
            (item) => item.status !== "done" && item.workerId === agent.id,
          ).length ?? 0,
      };
    });
  return {
    rows,
    pending: members.isPending,
    error: members.error ?? runs.error ?? tasks.error,
  };
}

export function AgentDot({ status }: { status: string }) {
  return (
    <span
      className={`agent-status-dot agent-status-${status} me-agent-dot`}
      aria-hidden="true"
    />
  );
}

export function MeProfile() {
  const { me, workspace } = useWorkspace();
  const { t } = useTranslation();
  return (
    <div className="me-profile">
      <span className="me-avatar" aria-hidden="true">
        {initial(me.user.name)}
      </span>
      <div className="me-profile-copy">
        <strong>{me.user.name}</strong>
        <span>
          {t(`organization.${workspace.role}`)} · {workspace.name}
        </span>
      </div>
    </div>
  );
}

/** Three languages as a segmented control (prototype offers two). */
export function LanguageControl({ labelId }: { labelId: string }) {
  const { setLocale, localePending } = useWorkspace();
  const { t } = useTranslation();
  const { locale } = useLocaleFormat();
  return (
    <div
      className="me-segmented"
      data-testid="locale-select"
      role="group"
      aria-labelledby={labelId}
    >
      {LANGUAGES.map((value) => (
        <Button
          type="button"
          key={value}
          aria-pressed={locale === value}
          disabled={localePending}
          onClick={() => setLocale(value)}
        >
          {t(
            value === "zh-HK"
              ? "me.languageHK"
              : value === "zh-CN"
                ? "me.languageCN"
                : "en",
          )}
        </Button>
      ))}
    </div>
  );
}

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => setTheme(readTheme()), []);
  const change = (next: ThemePreference) => {
    setTheme(next);
    applyTheme(next);
  };
  return [theme, change] as const;
}

/** Light and dark on the row; “follow system” lives in More settings. */
export function AppearanceControl({
  labelId,
  theme,
  onChange,
}: {
  labelId: string;
  theme: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="me-segmented" role="group" aria-labelledby={labelId}>
      {(["light", "dark"] as const).map((value) => (
        <Button
          type="button"
          key={value}
          data-testid={`theme-${value}`}
          aria-pressed={theme === value}
          onClick={() => onChange(value)}
        >
          {t(`me.${value}`)}
        </Button>
      ))}
    </div>
  );
}

/** Account details, time zone and the full appearance choice. */
export function AdvancedSheet({
  theme,
  onTheme,
  onClose,
}: {
  theme: ThemePreference;
  onTheme: (next: ThemePreference) => void;
  onClose: () => void;
}) {
  const { me, setTimeZone, localePending, profileError } = useWorkspace();
  const { t } = useTranslation();
  return (
    <SheetDialog title={t("me.advanced")} onClose={onClose}>
      {profileError && (
        <p className="alert" role="alert">
          {t(profileError)}
        </p>
      )}
      <dl className="me-account-details">
        <dt>{t("name")}</dt>
        <dd>{me.user.name}</dd>
        <dt>{t("email")}</dt>
        <dd>{me.user.email}</dd>
      </dl>
      <EmailVerification />
      <div className="field">
        <Label htmlFor="me-tz">{t("me.timeZone")}</Label>
        <select
          id="me-tz"
          data-testid="me-tz"
          value={me.user.tz}
          disabled={localePending}
          onChange={(event) => setTimeZone(event.target.value)}
        >
          {timeZones(me.user.tz).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="field-hint">{t("me.timeZoneHint")}</p>
      </div>
      <fieldset className="me-theme-options">
        <legend>{t("me.appearance")}</legend>
        <div
          className="me-segmented"
          role="group"
          aria-label={t("me.appearance")}
        >
          {THEMES.map((value) => (
            <Button
              type="button"
              key={value}
              data-testid={`advanced-theme-${value}`}
              aria-pressed={theme === value}
              onClick={() => onTheme(value)}
            >
              {t(`me.${value}`)}
            </Button>
          ))}
        </div>
      </fieldset>
      <p className="field-hint">{t("pwa.cacheHint")}</p>
    </SheetDialog>
  );
}

/** Organization switcher sheet; creating one continues on /orgs#create. */
export function OrganizationSheet({ onClose }: { onClose: () => void }) {
  const { me, setWorkspaceId } = useWorkspace();
  const { t } = useTranslation();
  return (
    <SheetDialog
      title={t("organization.switch")}
      className="organization-sheet"
      onClose={onClose}
    >
      <OrganizationChooser
        testIdPrefix="me-workspace-"
        onSelect={(id) => {
          setWorkspaceId(id);
          onClose();
          const name = me.workspaces.find((item) => item.id === id)?.name;
          if (name) showToast(t("toast.orgSwitched", { name }));
        }}
      />
    </SheetDialog>
  );
}

// Prototype v2 phone Me, Team Tasks.dc.html lines 414–496.
function MePhone() {
  const { workspace, signOut, signOutPending } = useWorkspace();
  const { t } = useTranslation();
  const { numbers } = useLocaleFormat();
  const inbox = useInbox(workspace.id);
  const needsYou = needsYouCount(inbox.data);
  const teamSummary = useTeamSummary();
  const notificationSummary = useNotificationSummary();
  const agents = useAgentRows();
  const [theme, changeTheme] = useThemePreference();
  const [sheet, setSheet] = useState<"organization" | "advanced" | null>(null);
  const appearance = theme === "system" ? undefined : theme;
  return (
    <section className="me-view">
      <h1 className="me-title">{t("me.title")}</h1>
      <MeProfile />
      <div className="me-rows">
        <Link
          className="me-row-control"
          href="/inbox"
          prefetch={false}
          data-testid="me-inbox"
        >
          <Inbox size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("nav.inbox")}</span>
          {needsYou > 0 && (
            <span
              className="me-count"
              aria-label={t("inbox.needsYou", { count: needsYou })}
            >
              {numbers.format(needsYou)}
            </span>
          )}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link
          className="me-row-control"
          href="/brief"
          prefetch={false}
          data-testid="me-brief"
        >
          <Sparkles size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("brief.nav")}</span>
          <BriefDot />
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <h2 className="me-section-label">{t("agentProfile.team")}</h2>
      <div className="me-rows">
        {agents.error ? (
          <p className="me-row-note" role="alert">
            {t(errorKey(agents.error))}
          </p>
        ) : agents.pending ? (
          <p className="me-row-note" aria-live="polite">
            {t("loading")}
          </p>
        ) : agents.rows.length === 0 ? (
          <p className="me-row-note">{t("me.noAgents")}</p>
        ) : (
          agents.rows.map((agent) => (
            <Link
              key={agent.id}
              className="me-row-control me-agent-row"
              href={`/agents/${agent.id}`}
              prefetch={false}
            >
              <span className="me-agent-mark" aria-hidden="true">
                <Sparkles size={16} strokeWidth={1.5} />
              </span>
              <span className="me-row-stack">
                <span className="me-row-label">{agent.name}</span>
                <span className="me-agent-status">
                  <AgentDot status={agent.status} />
                  {agent.label}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))
        )}
      </div>
      <h2 className="me-section-label">{t("me.settings")}</h2>
      <div className="me-rows">
        <Button
          type="button"
          className="me-row-control"
          data-testid="me-organization"
          onClick={() => setSheet("organization")}
        >
          <span className="me-workspace-mark" aria-hidden="true">
            {initial(workspace.name)}
          </span>
          <span className="me-row-label">{t("organization.label")}</span>
          <span className="me-row-value">{workspace.name}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
        <Link
          className="me-row-control"
          href="/orgs#team"
          prefetch={false}
          data-testid="me-team"
        >
          <Users size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("organization.team")}</span>
          <span className="me-row-value">{teamSummary}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link
          className="me-row-control"
          href="/me/mcp"
          prefetch={false}
          data-testid="open-mcp"
          aria-label={`${t("me.mcpSettings")} · ${t("mcp.running")}`}
        >
          <Plug size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("me.mcpSettings")}</span>
          <span className="me-row-value me-running">
            <span className="me-running-dot" aria-hidden="true" />
            {t("mcp.running")}
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <h2 id="preferences-heading" className="me-section-label">
        {t("me.preferences")}
      </h2>
      <div className="me-rows">
        <div className="me-preference-row">
          <Languages size={20} strokeWidth={1.5} aria-hidden="true" />
          <span id="me-language-label" className="me-row-label">
            {t("language")}
          </span>
          <LanguageControl labelId="me-language-label" />
        </div>
        <div className="me-preference-row">
          <Moon size={20} strokeWidth={1.5} aria-hidden="true" />
          <span id="me-appearance-label" className="me-row-label">
            {t("me.appearance")}
          </span>
          <AppearanceControl
            labelId="me-appearance-label"
            theme={appearance ?? "system"}
            onChange={changeTheme}
          />
        </div>
        <Link
          className="me-row-control me-tall-row"
          href="/me/notifications"
          prefetch={false}
          data-testid="open-notifications"
        >
          <Bell size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-stack">
            <span className="me-row-label">{t("notifications.title")}</span>
            <span className="me-row-summary">{notificationSummary}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Button
          type="button"
          className="me-row-control"
          data-testid="me-advanced"
          onClick={() => setSheet("advanced")}
        >
          <Settings2 size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("me.advanced")}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          className="me-row-control"
          onClick={signOut}
          disabled={signOutPending}
        >
          <LogOut size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="me-row-label">{t("signOut")}</span>
        </Button>
      </div>
      {sheet === "organization" && (
        <OrganizationSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "advanced" && (
        <AdvancedSheet
          theme={theme}
          onTheme={changeTheme}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
