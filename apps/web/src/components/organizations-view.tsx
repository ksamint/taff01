"use client";
import {
  issuedWorkspaceInviteSchema,
  type Member,
  memberRoleInputSchema,
  type WorkspaceCreate,
  type WorkspaceInvite,
  type WorkspaceInviteInput,
  workspaceCreateSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteInputSchema,
  workspaceInviteSchema,
  workspaceSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import { useWorkspaceAccess } from "../lib/m5-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { meKey, membersKey, useMembers } from "../lib/queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../lib/query-snapshot";
import { sessionVersion } from "../lib/session-cache";
import { useWorkspace } from "./app-shell";
import { useWorkspaceSelection } from "./providers";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";
export function OrganizationsView() {
  const { me, workspace, setWorkspaceId } = useWorkspace();
  const { invitation, setInvitation } = useWorkspaceSelection();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const key = ["invites", workspace.id] as const;
  const drafts = ["org-drafts", me.user.id] as const;
  const invites = useQuery({
    queryKey: key,
    enabled: !!access.data?.canInvite,
    queryFn: async () =>
      (await request<unknown[]>(`/api/workspaces/${workspace.id}/invites`)).map(
        (value) => workspaceInviteSchema.parse(value),
      ),
  });
  const [dialog, setDialog] = useState<"create" | "invite" | null>(null);
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceInviteInput["role"]>("member");
  const [issued, setIssued] = useState<{
    link: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [validation, setValidation] = useState(false);
  const invalidate = () => {
    if (client.isMutating() > 1) return;
    return Promise.all([
      invalidateM3(client),
      client.invalidateQueries({ queryKey: meKey }),
    ]);
  };
  const create = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: WorkspaceCreate) =>
      request("/api/workspaces", {
        method: "POST",
        body: JSON.stringify(workspaceCreateSchema.parse(body)),
      }).then(workspaceSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotQueries(client, [drafts]);
      client.setQueryData(drafts, body.name);
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (value, _, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      client.removeQueries({ queryKey: drafts });
      setDialog(null);
      setName("");
      setWorkspaceId(value.id);
    },
    onSettled: invalidate,
  });
  const accept = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: () =>
      request("/api/workspace-invites/accept", {
        method: "POST",
        body: JSON.stringify(
          workspaceInviteAcceptSchema.parse({ token: invitation }),
        ),
      }).then(workspaceSchema.parse),
    onMutate: () => snapshotQueries(client, []),
    onSuccess: (value, _, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      setInvitation(null);
      setWorkspaceId(value.id);
    },
    onSettled: invalidate,
  });
  const changeRole = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, next }: { id: string; next: Member["role"] }) =>
      request(`/api/workspaces/${workspace.id}/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify(memberRoleInputSchema.parse({ role: next })),
      }),
    onMutate: async ({ id, next }) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<Member[]>(membersKey(workspace.id), (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, role: next } : item,
        ),
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: invalidate,
  });
  const issue = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: WorkspaceInviteInput) => {
      const version = sessionVersion(client);
      const { token, ...metadata } = issuedWorkspaceInviteSchema.parse(
        await request(`/api/workspaces/${workspace.id}/invites`, {
          method: "POST",
          body: JSON.stringify(workspaceInviteInputSchema.parse(body)),
        }),
      );
      if (version === sessionVersion(client))
        setIssued({
          link: `${window.location.origin}/#invite=${encodeURIComponent(token)}`,
          expiresAt: metadata.expiresAt,
        });
      return metadata;
    },
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      client.setQueryData<WorkspaceInvite[]>(key, (current) => [
        {
          ...body,
          id,
          workspaceId: workspace.id,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        ...(current ?? []),
      ]);
      setIssued(null);
      setCopied(null);
      return { id, snapshot };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (value, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const metadata = value;
      client.setQueryData<WorkspaceInvite[]>(key, (current) =>
        current?.map((item) => (item.id === context.id ? metadata : item)),
      );
    },
    onSettled: invalidate,
  });
  const revoke = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (id: string) =>
      request(`/api/workspace-invites/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<WorkspaceInvite[]>(key, (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, status: "revoked" } : item,
        ),
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: invalidate,
  });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me.user.tz,
    }).format(new Date(value));
  const error =
    create.error ??
    accept.error ??
    changeRole.error ??
    issue.error ??
    revoke.error ??
    access.error ??
    members.error ??
    invites.error;
  return (
    <>
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
              setIssued(null);
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
      <Button
        disabled={busy}
        onClick={() => {
          setDialog("create");
          setValidation(false);
        }}
      >
        {t("organization.create")}
      </Button>
      <section className="me-section" id="team">
        <h2>{t("organization.team")}</h2>
        <ul className="history-list">
          {members.data?.map((member) => (
            <li key={member.id} className="member-role-row">
              <div>
                {member.kind === "agent" ? (
                  <Link className="text-link" href={`/agents/${member.id}`}>
                    {member.name}
                  </Link>
                ) : (
                  <strong>{member.name}</strong>
                )}
                <p className="quiet">
                  {t(
                    member.kind === "agent"
                      ? "agent"
                      : `organization.${member.role}`,
                  )}
                </p>
              </div>
              {member.kind === "person" && access.data?.canManageRoles && (
                <select
                  aria-label={t("organization.roleFor", { name: member.name })}
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
          ))}
        </ul>
      </section>
      {access.data?.canInvite && (
        <section className="me-section">
          <div className="section-title-row">
            <h2>{t("organization.invites")}</h2>
            <Button
              disabled={busy}
              onClick={() => {
                setDialog("invite");
                setValidation(false);
                setIssued(null);
                issue.reset();
              }}
            >
              {t("organization.invite")}
            </Button>
          </div>
          <p className="section-hint">{t("organization.inviteHint")}</p>
          {invites.isPending ? (
            <p>{t("loading")}</p>
          ) : !invites.data?.length ? (
            <p className="quiet">{t("organization.noInvites")}</p>
          ) : (
            <ul className="history-list">
              {invites.data.map((item) => (
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
        <SheetDialog
          title={t("organization.create")}
          onClose={() => setDialog(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = workspaceCreateSchema.safeParse({
                name,
                agentIds: agents,
              });
              setValidation(!parsed.success);
              if (parsed.success) create.mutate(parsed.data);
            }}
          >
            <p className="section-hint">{t("organization.createHint")}</p>
            <div className="field">
              <Label htmlFor="org-name">{t("organization.name")}</Label>
              <Input
                id="org-name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
            </div>
            {access.data?.canManageRoles && (
              <fieldset className="field plain-fieldset">
                <legend>{t("organization.agentsToCopy")}</legend>
                <p className="section-hint">{t("organization.agentsHint")}</p>
                {members.data
                  ?.filter((item) => item.kind === "agent")
                  .map((agent) => (
                    <label className="check-row" key={agent.id}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={agents.includes(agent.id)}
                        onChange={(event) =>
                          setAgents((current) =>
                            event.target.checked
                              ? [...current, agent.id]
                              : current.filter((id) => id !== agent.id),
                          )
                        }
                      />
                      {agent.name}
                    </label>
                  ))}
              </fieldset>
            )}
            {validation && (
              <p role="alert" className="alert">
                {t("errors.invalid_input")}
              </p>
            )}
            <Button disabled={busy}>
              {t(create.isPending ? "working" : "organization.create")}
            </Button>
          </form>
        </SheetDialog>
      )}
      {dialog === "invite" && (
        <SheetDialog
          title={t("organization.invite")}
          onClose={() => {
            setDialog(null);
            setIssued(null);
          }}
        >
          <p className="section-hint">{t("organization.inviteHint")}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = workspaceInviteInputSchema.safeParse({
                email,
                role,
              });
              setValidation(!parsed.success);
              if (parsed.success) issue.mutate(parsed.data);
            }}
          >
            <div className="field">
              <Label htmlFor="invite-email">{t("email")}</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <Label htmlFor="invite-role">{t("organization.role")}</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as WorkspaceInviteInput["role"])
                }
                disabled={busy}
              >
                {["admin", "member", "guest"].map((value) => (
                  <option key={value} value={value}>
                    {t(`organization.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            {validation && (
              <p role="alert" className="alert">
                {t("errors.invalid_input")}
              </p>
            )}
            {issue.error && (
              <p role="alert" className="alert">
                {t(errorKey(issue.error))}
              </p>
            )}
            <Button disabled={busy}>
              {t(issue.isPending ? "working" : "organization.invite")}
            </Button>
          </form>
          {issued && (
            <section className="invite-preview" aria-live="polite">
              <h3>{t("organization.inviteCreated")}</h3>
              <p className="quiet">
                {t("organization.expires", {
                  date: formatDate(issued.expiresAt),
                })}
              </p>
              <Label htmlFor="issued-invite">
                {t("organization.copyLink")}
              </Label>
              <Input
                id="issued-invite"
                readOnly
                value={issued.link}
                onFocus={(event) => event.target.select()}
              />
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(issued.link).then(
                    () => setCopied("organization.copied"),
                    () => setCopied("organization.copyFailed"),
                  );
                }}
              >
                {t("organization.copyLink")}
              </Button>
              {copied && <p role="status">{t(copied)}</p>}
            </section>
          )}
        </SheetDialog>
      )}
    </>
  );
}
