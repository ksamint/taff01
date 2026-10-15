"use client";
// Prototype v2 desktop Me tabs, Team Tasks.dc.html lines 1230 and 1443–1537.
import type { Member } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import { ExternalLink, LogOut, Plus, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useWorkspaceAccess } from "../lib/m5-queries";
import {
  useChangeMemberRole,
  useCreateWorkspace,
  useRevokeWorkspaceInvite,
} from "../lib/mutations/organizations";
import { needsYouCount } from "../lib/needs-you";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useInbox, useMembers, useTasks } from "../lib/queries";
import { showToast } from "../lib/toast";
import { AiSettingsSection } from "./ai-settings";
import { useWorkspace } from "./app-shell";
import {
  AdvancedSheet,
  AgentDot,
  AppearanceControl,
  BriefDot,
  initial,
  LanguageControl,
  MeProfile,
  OrganizationSheet,
  useAgentRows,
  useLocaleFormat,
  useTeamSummary,
  useThemePreference,
} from "./me-view";
import {
  CreateOrganizationDialog,
  InviteMemberDialog,
  useInviteDateFormat,
  useWorkspaceInvites,
} from "./organization-dialogs";
import { Button } from "./ui/button";

const InboxView = dynamic(
  () => import("./inbox-view").then((module) => module.InboxView),
  { ssr: false, loading: () => null },
);
const AgentProfileView = dynamic(
  () =>
    import("./agent-profile-view").then((module) => module.AgentProfileView),
  { ssr: false, loading: () => null },
);
const NotificationsView = dynamic(
  () =>
    import("./notifications-view").then((module) => module.NotificationsView),
  { ssr: false, loading: () => null },
);

const BriefView = dynamic(
  () => import("./brief-view").then((module) => module.BriefView),
  { ssr: false, loading: () => null },
);

const TABS = ["inbox", "brief", "agents", "settings"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | null): value is Tab =>
  TABS.includes(value as Tab);
const ROLES = ["admin", "member", "guest"] as const;

export function MeDesktop() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const { numbers } = useLocaleFormat();
  const params = useSearchParams();
  const requested = params.get("tab");
  // Settings links such as /me#preferences-heading land on the settings tab.
  const [hashTab, setHashTab] = useState<Tab | null>(null);
  useEffect(() => {
    if (window.location.hash) setHashTab("settings");
  }, []);
  const tab: Tab = isTab(requested) ? requested : (hashTab ?? "inbox");
  const inbox = useInbox(workspace.id);
  const count = needsYouCount(inbox.data);
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({
    inbox: null,
    brief: null,
    agents: null,
    settings: null,
  });
  const select = (next: Tab, focus = false) => {
    // Next keeps useSearchParams in sync with native history updates.
    window.history.replaceState(null, "", `/me?tab=${next}`);
    if (focus) refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? TABS[(index + 1) % TABS.length]
        : event.key === "ArrowLeft"
          ? TABS[(index + TABS.length - 1) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  };
  return (
    <section className="me-desk">
      <header className="me-desk-header">
        <h1>{t("me.title")}</h1>
        <div
          className="me-desk-tabs"
          role="tablist"
          aria-label={t("me.title")}
          onKeyDown={onKeyDown}
        >
          {TABS.map((key) => (
            <button
              key={key}
              ref={(node) => {
                refs.current[key] = node;
              }}
              type="button"
              role="tab"
              id={`me-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`me-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className="me-desk-tab"
              data-testid={`me-tab-${key}`}
              onClick={() => select(key)}
            >
              {t(
                key === "inbox"
                  ? "nav.inbox"
                  : key === "brief"
                    ? "brief.nav"
                    : key === "agents"
                      ? "agentProfile.team"
                      : "me.settings",
              )}
              {key === "inbox" && count > 0 && (
                <span
                  className="me-desk-tab-count"
                  aria-label={t("inbox.needsYou", { count })}
                >
                  {numbers.format(count)}
                </span>
              )}
              {key === "brief" && <BriefDot />}
            </button>
          ))}
        </div>
      </header>
      <div
        className="me-desk-panel"
        role="tabpanel"
        id={`me-panel-${tab}`}
        aria-labelledby={`me-tab-${tab}`}
      >
        {tab === "inbox" ? (
          <InboxView embedded />
        ) : tab === "brief" ? (
          <BriefView onClose={() => select("inbox", true)} />
        ) : tab === "agents" ? (
          <AgentsTab />
        ) : (
          <SettingsTab />
        )}
      </div>
    </section>
  );
}

// Lines 1470–1497: agent cards, then the chosen agent's profile.
function AgentsTab() {
  const { t } = useTranslation();
  const agents = useAgentRows();
  const [chosen, setChosen] = useState<string | null>(null);
  const current =
    agents.rows.find((agent) => agent.id === chosen) ?? agents.rows[0];
  if (agents.error)
    return (
      <p className="me-desk-note" role="alert">
        {t(errorKey(agents.error))}
      </p>
    );
  if (agents.pending)
    return (
      <p className="me-desk-note" aria-live="polite">
        {t("loading")}
      </p>
    );
  if (!current) return <p className="me-desk-note">{t("me.noAgents")}</p>;
  return (
    <div className="me-agents">
      <div className="me-agent-grid">
        {agents.rows.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className="me-agent-card"
            aria-pressed={agent.id === current.id}
            onClick={() => setChosen(agent.id)}
          >
            <span className="me-agent-card-head">
              <span className="me-agent-mark" aria-hidden="true">
                <Sparkles size={16} strokeWidth={1.5} />
              </span>
              <span className="me-row-stack">
                <span className="me-agent-card-name">{agent.name}</span>
                <span className="me-agent-status">
                  <AgentDot status={agent.status} />
                  {agent.label}
                </span>
              </span>
            </span>
            <span className="me-agent-card-work">
              {agent.taskTitle ?? t("me.noActiveTasks")}
            </span>
            <span className="me-agent-card-meta">
              {t("taskCount", { count: agent.openTasks })}
            </span>
          </button>
        ))}
      </div>
      <div className="me-agent-profile">
        <AgentProfileView key={current.id} agentId={current.id} embedded />
      </div>
    </div>
  );
}

// Lines 1498–1534, plus the parity features the prototype left out:
// create organization, invitations, role changes, quiet hours and digest time.
function SettingsTab() {
  const { me, workspace, setWorkspaceId, signOut, signOutPending } =
    useWorkspace();
  const { t } = useTranslation();
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const tasks = useTasks(workspace.id);
  const invites = useWorkspaceInvites(workspace.id, !!access.data?.canInvite);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const changeRole = useChangeMemberRole(workspace.id);
  const revoke = useRevokeWorkspaceInvite(workspace.id);
  const formatDate = useInviteDateFormat();
  const teamSummary = useTeamSummary();
  const [theme, changeTheme] = useThemePreference();
  const [dialog, setDialog] = useState<
    "organization" | "create" | "invite" | "advanced" | null
  >(null);
  const create = useCreateWorkspace(me.user.id, {
    onCreated: (value) => {
      setDialog(null);
      setWorkspaceId(value.id);
      showToast(t("toast.orgCreated", { name: value.name }));
    },
  });
  const people = members.data?.filter((member) => member.kind === "person");
  const openTasks = (member: Member) =>
    tasks.data?.filter(
      (task) =>
        task.status !== "done" &&
        (task.workerId === member.id || task.ownerId === member.id),
    ).length;
  const error =
    changeRole.error ?? revoke.error ?? members.error ?? invites.error;
  const mcpUrl =
    typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`;
  return (
    <div className="me-settings">
      <MeProfile />
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      <section aria-labelledby="me-settings-org">
        <h2 id="me-settings-org" className="me-settings-label">
          {t("organization.label")}
        </h2>
        <div className="me-settings-row">
          <span className="me-workspace-mark is-large" aria-hidden="true">
            {initial(workspace.name)}
          </span>
          <span className="me-row-stack">
            <span className="me-settings-name">{workspace.name}</span>
            <span className="me-row-summary">{teamSummary}</span>
          </span>
          <Button
            type="button"
            className="me-outline"
            data-testid="me-organization"
            onClick={() => setDialog("organization")}
          >
            {t("organization.switchShort")}
          </Button>
          <Button
            type="button"
            className="me-outline"
            data-testid="me-create-organization"
            disabled={busy}
            onClick={() => setDialog("create")}
          >
            <Plus size={16} aria-hidden="true" />
            {t("organization.create")}
          </Button>
        </div>
      </section>
      <section aria-labelledby="me-settings-people">
        <div className="me-settings-heading">
          <h2 id="me-settings-people" className="me-settings-label">
            {t("organization.people")}
          </h2>
          <Link className="me-settings-link" href="/orgs#team" prefetch={false}>
            {t("organization.team")}
          </Link>
        </div>
        <ul className="me-settings-list">
          {people?.map((member) => {
            const count = openTasks(member);
            return (
              <li key={member.id} className="me-settings-row">
                <span className="me-person-avatar" aria-hidden="true">
                  {initial(member.name)}
                </span>
                <span className="me-row-stack">
                  <span className="me-settings-name">{member.name}</span>
                  <span className="me-row-summary">
                    {t(`organization.${member.role}`)}
                  </span>
                </span>
                {count !== undefined && (
                  <span className="me-settings-meta">
                    {t("taskCount", { count })}
                  </span>
                )}
                {access.data?.canManageRoles && (
                  <select
                    className="me-role-select"
                    aria-label={t("organization.roleFor", {
                      name: member.name,
                    })}
                    data-testid={`me-role-${member.id}`}
                    value={member.role}
                    disabled={busy || member.id.startsWith("optimistic:")}
                    onChange={(event) =>
                      changeRole.mutate({
                        id: member.id,
                        next: event.target.value as Member["role"],
                      })
                    }
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {t(`organization.${value}`)}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
        {access.data?.canInvite && (
          <div className="me-invites">
            <div className="me-settings-heading">
              <h3 className="me-settings-label">{t("organization.invites")}</h3>
              <Button
                type="button"
                className="me-outline"
                data-testid="me-invite"
                disabled={busy}
                onClick={() => setDialog("invite")}
              >
                <Plus size={16} aria-hidden="true" />
                {t("organization.invite")}
              </Button>
            </div>
            {invites.isPending ? (
              <p className="me-row-summary">{t("loading")}</p>
            ) : !invites.data?.length ? (
              <p className="me-row-summary">{t("organization.noInvites")}</p>
            ) : (
              <ul className="me-settings-list">
                {invites.data.map((item) => (
                  <li key={item.id} className="me-settings-row">
                    <span className="me-row-stack">
                      <span className="me-settings-name">{item.email}</span>
                      <span className="me-row-summary">
                        {t(`organization.${item.role}`)} ·{" "}
                        {t(`organization.status.${item.status}`)} ·{" "}
                        {t("organization.expires", {
                          date: formatDate(item.expiresAt),
                        })}
                      </span>
                    </span>
                    {item.status === "pending" && (
                      <Button
                        type="button"
                        className="button-quiet"
                        disabled={busy || item.id.startsWith("optimistic:")}
                        onClick={() => revoke.mutate(item.id)}
                      >
                        {t("organization.revoke")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <section aria-labelledby="me-settings-notifications">
        <h2 id="me-settings-notifications" className="me-settings-label">
          {t("notifications.title")}
        </h2>
        <NotificationsView embedded />
      </section>
      <section aria-labelledby="me-settings-mcp">
        <h2 id="me-settings-mcp" className="me-settings-label">
          {t("mcp.title")}
        </h2>
        <div className="me-settings-row">
          <span className="me-settings-key">{t("mcp.endpoint")}</span>
          <span className="me-settings-mono">{mcpUrl}</span>
          <span className="me-running">
            <span className="me-running-dot" aria-hidden="true" />
            {t("mcp.running")}
          </span>
          <Link
            className="button me-outline"
            href="/me/mcp"
            prefetch={false}
            data-testid="open-mcp"
          >
            <ExternalLink size={16} aria-hidden="true" />
            {t("mcp.open")}
          </Link>
        </div>
      </section>
      <AiSettingsSection />
      <section aria-labelledby="preferences-heading">
        <h2 id="preferences-heading" className="me-settings-label">
          {t("me.preferences")}
        </h2>
        <div className="me-settings-row">
          <span id="me-desk-language" className="me-settings-name me-grow">
            {t("language")}
          </span>
          <LanguageControl labelId="me-desk-language" />
        </div>
        <div className="me-settings-row">
          <span id="me-desk-appearance" className="me-settings-name me-grow">
            {t("me.appearance")}
          </span>
          <AppearanceControl
            labelId="me-desk-appearance"
            theme={theme}
            onChange={changeTheme}
          />
        </div>
        <div className="me-settings-row">
          <span className="me-settings-name me-grow">{t("me.advanced")}</span>
          <Button
            type="button"
            className="me-outline"
            data-testid="me-advanced"
            onClick={() => setDialog("advanced")}
          >
            {t("me.advanced")}
          </Button>
        </div>
      </section>
      <div className="me-settings-row me-signout-row">
        <span className="me-row-stack">
          <span className="me-settings-name">{me.user.name}</span>
          <span className="me-row-summary">
            {t("home.signedIn")} · {workspace.name}
          </span>
        </span>
        <Button
          type="button"
          className="me-outline"
          onClick={signOut}
          disabled={signOutPending}
        >
          <LogOut size={16} aria-hidden="true" />
          {t("signOut")}
        </Button>
      </div>
      {dialog === "organization" && (
        <OrganizationSheet onClose={() => setDialog(null)} />
      )}
      {dialog === "create" && (
        <CreateOrganizationDialog
          create={create}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "invite" && (
        <InviteMemberDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "advanced" && (
        <AdvancedSheet
          theme={theme}
          onTheme={changeTheme}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
