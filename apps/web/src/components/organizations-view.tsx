"use client";
import "../styles/team-parity.css";
import "../styles/organizations.css";
import {
  type Locale,
  type Member,
  type Run,
  workspaceAgentInputSchema,
} from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useAgent } from "../lib/m3-queries";
import { useWorkspaceAccess } from "../lib/m5-queries";
import {
  useAcceptWorkspaceInvite,
  useAddWorkspaceAgent,
  useChangeMemberRole,
  useCreateWorkspace,
  useDefaultWorkspace,
  useRevokeWorkspaceInvite,
} from "../lib/mutations/organizations";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers, useRuns, useTasks } from "../lib/queries";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { EmailVerification } from "./email-verification";
import {
  CreateOrganizationDialog,
  InviteMemberDialog,
  useInviteDateFormat,
  useWorkspaceInvites,
} from "./organization-dialogs";
import { useWorkspaceSelection } from "./providers";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

function TeamAgentDetails({
  member,
  members,
  locale,
  status,
}: {
  member: Member;
  members: Member[];
  locale: Locale;
  status: Run["status"] | undefined;
}) {
  const profile = useAgent(member.id);
  const { t } = useTranslation();
  const data =
    profile.data?.member.workspaceId === member.workspaceId
      ? profile.data
      : undefined;
  if (profile.error)
    return <span role="alert">{t(errorKey(profile.error))}</span>;
  if (!data) return <span>{t("loading")}</span>;
  const supervisor = members.find((item) => item.id === data.supervisorId);
  const name = supervisor
    ? supervisor.name
    : t(data.supervisorId ? "unknownMember" : "none");
  return (
    <>
      <span
        className="team-agent-supervisor"
        data-testid={`team-supervisor-${member.id}`}
      >
        {t("agentProfile.supervisedBy", { name })}
      </span>
      {status && (
        <span className="team-agent-status">
          <span
            className={`agent-status-dot agent-status-${status}`}
            aria-hidden="true"
          />
          {t(`run.status.${status}`)}
        </span>
      )}
      <span
        className="team-agent-capabilities"
        role="list"
        aria-label={t("agentProfile.permissions")}
        data-testid={`team-capabilities-${member.id}`}
      >
        {data.permissions
          .filter((permission) => permission.decision !== "deny")
          .map((permission) => (
            <span key={permission.capability} role="listitem">
              {t(`agentProfile.capability.${permission.capability}`)}
            </span>
          ))}
      </span>
    </>
  );
}

export function OrganizationsView() {
  const [teamOnly, setTeamOnly] = useState(false);
  useEffect(() => {
    const sync = () => {
      setTeamOnly(window.location.hash === "#team");
      if (window.location.hash === "#create") setDialog("create");
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const { me, workspace, setWorkspaceId, confirmed } = useWorkspace();
  const { invitation, setInvitation } = useWorkspaceSelection();
  const { t, i18n } = useTranslation();
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const tasks = useTasks(workspace.id);
  const runs = useRuns(workspace.id);
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const invites = useWorkspaceInvites(workspace.id, !!access.data?.canInvite);
  const [dialog, setDialog] = useState<"create" | "invite" | "agent" | null>(
    null,
  );
  const [agentName, setAgentName] = useState("");
  const [validation, setValidation] = useState(false);
  const create = useCreateWorkspace(me.user.id, {
    onCreated: (value) => {
      setDialog(null);
      setWorkspaceId(value.id);
      showToast(t("toast.orgCreated", { name: value.name }));
    },
  });
  const addAgent = useAddWorkspaceAgent(workspace.id, {
    onAdded: () => {
      setDialog(null);
      setAgentName("");
    },
  });
  const accept = useAcceptWorkspaceInvite(invitation, {
    onAccepted: (value) => {
      setInvitation(null);
      setWorkspaceId(value.id);
    },
  });
  const defaults = useDefaultWorkspace();
  const changeRole = useChangeMemberRole(workspace.id);
  const revoke = useRevokeWorkspaceInvite(workspace.id);
  const formatDate = useInviteDateFormat();
  const openInvite = () => setDialog("invite");
  const addAgentReason = !confirmed
    ? "organization.sessionPending"
    : access.isPending || members.isPending
      ? "loading"
      : !access.data?.canManageRoles
        ? "organization.adminRequired"
        : busy
          ? "working"
          : members.isError
            ? "errors.internal_error"
            : null;
  const error =
    defaults.error ??
    accept.error ??
    changeRole.error ??
    revoke.error ??
    addAgent.error ??
    access.error ??
    members.error ??
    invites.error;
  return (
    <div className={`organizations-view${teamOnly ? " team-only" : ""}`}>
      <header className="organization-toolbar">
        <Link className="button button-quiet" href="/me">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("mcp.back")}
        </Link>
      </header>
      <section className="page-heading">
        <h1>{t("organization.title")}</h1>
        <p className="section-hint">{t("organization.switchHint")}</p>
      </section>
      {error && (
        <p role="alert" className="alert">
          {t(errorKey(error))}
        </p>
      )}
      {invitation && (
        <section className="invite-banner">
          <h2>{t("organization.accept")}</h2>
          <p>{t("organization.acceptHint")}</p>
          <EmailVerification />
          <Button
            data-testid="accept-invitation"
            disabled={busy}
            onClick={() => accept.mutate()}
          >
            {t(accept.isPending ? "working" : "organization.accept")}
          </Button>
          <Button
            className="button-quiet"
            disabled={busy}
            onClick={() => setInvitation(null)}
          >
            {t("organization.dismiss")}
          </Button>
        </section>
      )}
      <section className="me-section">
        <Label htmlFor="default-workspace">
          {t("organization.loginDefault")}
        </Label>
        <select
          id="default-workspace"
          disabled={busy}
          value={me.user.defaultWorkspaceId ?? ""}
          onChange={(event) =>
            defaults.mutate({
              userId: me.user.id,
              workspaceId: event.target.value || null,
            })
          }
        >
          <option value="">{t("organization.automaticDefault")}</option>
          {me.workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="section-hint">{t("organization.loginDefaultHint")}</p>
      </section>
      <div className="org-grid">
        {me.workspaces.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`org-card${item.id === workspace.id ? " selected" : ""}`}
            disabled={busy}
            aria-pressed={item.id === workspace.id}
            data-testid={`workspace-${item.id}`}
            onClick={() => {
              setWorkspaceId(item.id);
            }}
          >
            <strong>{item.name}</strong>
            <span className="quiet">
              {t(
                item.id === workspace.id
                  ? "organization.current"
                  : "organization.switch",
              )}
            </span>
          </button>
        ))}
        {create.isPending && (
          <div className="org-card" aria-live="polite">
            <strong>{create.variables.name}</strong>
            <span>{t("working")}</span>
          </div>
        )}
      </div>
      <Button disabled={busy} onClick={() => setDialog("create")}>
        {t("organization.create")}
      </Button>
      <section className="team-directory" id="team">
        <header className="organization-toolbar">
          <Link className="button button-quiet" href="/me">
            <ArrowLeft size={16} aria-hidden="true" />
            {t("mcp.back")}
          </Link>
        </header>
        <h1>{t("organization.team")}</h1>
        {(["person", "agent"] as const).map((kind) => (
          <section key={kind}>
            <h2>
              {t(
                kind === "person" ? "organization.people" : "agentProfile.team",
              )}{" "}
              ·{" "}
              {new Intl.NumberFormat(locale).format(
                members.data?.filter((member) => member.kind === kind).length ??
                  0,
              )}
            </h2>
            {members.isPending && <p role="status">{t("loading")}</p>}
            {members.isSuccess &&
              !members.data.some((member) => member.kind === kind) && (
                <p role="status">
                  {t(
                    kind === "agent"
                      ? "oauth.noAgent"
                      : "organization.noPeople",
                  )}
                </p>
              )}
            <ul className="team-directory-list">
              {members.data
                ?.filter((member) => member.kind === kind)
                .map((member) => {
                  const name = member.name;
                  const pending = member.id.startsWith("optimistic:");
                  const latest = runs.data
                    ?.filter((run) => run.agentId === member.id)
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
                  const assigned = tasks.data?.filter(
                    (task) =>
                      task.status !== "done" &&
                      (task.workerId === member.id ||
                        task.ownerId === member.id),
                  ).length;
                  const content = (
                    <>
                      <span
                        className={`team-avatar team-avatar-${kind}`}
                        aria-hidden="true"
                      >
                        {kind === "agent" ? (
                          <Sparkles size={18} />
                        ) : (
                          name.slice(0, 1)
                        )}
                      </span>
                      <span className="team-member-copy">
                        <strong>{name}</strong>
                        {pending ? (
                          <span>{t("adding")}</span>
                        ) : kind === "agent" ? (
                          <TeamAgentDetails
                            member={member}
                            members={members.data ?? []}
                            locale={locale}
                            status={latest?.status}
                          />
                        ) : (
                          <span>{t(`organization.${member.role}`)}</span>
                        )}
                      </span>
                    </>
                  );
                  return (
                    <li key={member.id} className="member-role-row">
                      {kind === "agent" && !pending ? (
                        <Link
                          className="team-agent-link"
                          href={`/agents/${member.id}`}
                        >
                          {content}
                        </Link>
                      ) : kind === "agent" ? (
                        <span className="team-agent-link" aria-busy="true">
                          {content}
                        </span>
                      ) : (
                        content
                      )}
                      {assigned !== undefined && (
                        <span className="team-workload">
                          {t("taskCount", { count: assigned })}
                        </span>
                      )}
                      {kind === "person" &&
                        me.user.systemAdmin &&
                        member.userId && (
                          <Button
                            className="team-login-default-button"
                            disabled={busy}
                            onClick={() =>
                              defaults.mutate(
                                {
                                  userId: member.userId!,
                                  workspaceId: workspace.id,
                                },
                                {
                                  onSuccess: () =>
                                    showToast(
                                      t("organization.defaultUpdated", {
                                        name: member.name,
                                      }),
                                    ),
                                },
                              )
                            }
                          >
                            {t("organization.setMemberDefault", {
                              name: member.name,
                            })}
                          </Button>
                        )}
                      {kind === "person" && access.data?.canManageRoles && (
                        <select
                          aria-label={t("organization.roleFor", {
                            name: member.name,
                          })}
                          data-testid={`role-${member.id}`}
                          value={member.role}
                          disabled={busy}
                          onChange={(event) =>
                            changeRole.mutate({
                              id: member.id,
                              next: event.target.value as Member["role"],
                            })
                          }
                        >
                          {["admin", "member", "guest"].map((value) => (
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
            {kind === "person" && teamOnly && access.data?.canInvite && (
              <div className="team-invite-row">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={openInvite}
                  data-testid="team-invite"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t("organization.invite")}
                </Button>
              </div>
            )}
            {kind === "agent" && (
              <div className="team-invite-row">
                <Button
                  type="button"
                  disabled={!!addAgentReason}
                  aria-describedby="add-agent-reason"
                  data-testid="team-add-agent"
                  onClick={() => {
                    setDialog("agent");
                    setAgentName("");
                    setValidation(false);
                    addAgent.reset();
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  {t("organization.addAgent")}
                </Button>
                {addAgentReason && (
                  <p id="add-agent-reason" role="status">
                    {t(addAgentReason)}
                  </p>
                )}
              </div>
            )}
          </section>
        ))}
        {(tasks.isError || runs.isError) && (
          <p className="alert" role="alert">
            {t(errorKey(tasks.error ?? runs.error))}
          </p>
        )}
      </section>
      {access.data?.canInvite && (
        <section className="me-section">
          <div className="section-title-row">
            <h2>{t("organization.invites")}</h2>
            <Button disabled={busy} onClick={openInvite}>
              {t("organization.invite")}
            </Button>
          </div>
          <p className="section-hint">{t("organization.inviteHint")}</p>
          {invites.isPending ? (
            <p>{t("loading")}</p>
          ) : (
            <ul className="history-list">
              {!invites.data?.length && (
                <li className="quiet">{t("organization.noInvites")}</li>
              )}
              {invites.data?.map((item) => (
                <li key={item.id}>
                  <strong>{item.email}</strong>
                  <p className="quiet">
                    {t(`organization.${item.role}`)} ·{" "}
                    {t(`organization.status.${item.status}`)} ·{" "}
                    {t("organization.expires", {
                      date: formatDate(item.expiresAt),
                    })}
                  </p>
                  {item.status === "pending" && (
                    <Button
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
        </section>
      )}
      {dialog === "create" && (
        <CreateOrganizationDialog
          create={create}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "agent" && (
        <SheetDialog
          title={t("organization.addAgent")}
          onClose={() => setDialog(null)}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = workspaceAgentInputSchema.safeParse({
                name: agentName,
                kind: "agent",
              });
              setValidation(!parsed.success);
              if (
                parsed.success &&
                confirmed &&
                access.data?.canManageRoles &&
                !busy
              )
                addAgent.mutate(parsed.data);
            }}
          >
            <div className="field">
              <Label htmlFor="agent-name">{t("organization.agentName")}</Label>
              <Input
                id="agent-name"
                data-testid="agent-name"
                required
                maxLength={100}
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
                disabled={busy || !confirmed || !access.data?.canManageRoles}
              />
            </div>
            {validation && (
              <p role="alert" className="alert">
                {t("errors.invalid_input")}
              </p>
            )}
            {addAgent.error && (
              <p role="alert" className="alert">
                {t(errorKey(addAgent.error))}
              </p>
            )}
            <Button
              data-testid="agent-create"
              disabled={busy || !confirmed || !access.data?.canManageRoles}
            >
              {t(addAgent.isPending ? "working" : "organization.addAgent")}
            </Button>
          </form>
        </SheetDialog>
      )}
      {dialog === "invite" && (
        <InviteMemberDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
