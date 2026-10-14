"use client";
// Organization dialogs shared by /orgs and the desktop Me › Settings tab.
import {
  type WorkspaceInviteInput,
  workspaceCreateSchema,
  workspaceInviteInputSchema,
  workspaceInviteSchema,
} from "@taff/schemas";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useWorkspaceAccess } from "../lib/m5-queries";
import {
  type IssuedInviteLink,
  invitesKey,
  type useCreateWorkspace,
  useIssueWorkspaceInvite,
} from "../lib/mutations/organizations";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const ROLES = ["admin", "member", "guest"] as const;

/** Pending and past invitations of the workspace, for people who may invite. */
export function useWorkspaceInvites(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: invitesKey(workspaceId),
    enabled,
    queryFn: async () =>
      (await request<unknown[]>(`/api/workspaces/${workspaceId}/invites`)).map(
        (value) => workspaceInviteSchema.parse(value),
      ),
  });
}

export function useInviteDateFormat() {
  const { me } = useWorkspace();
  const { i18n } = useTranslation();
  return (value: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me.user.tz,
    }).format(new Date(value));
}

/**
 * Creates an organization. The parent owns the mutation so it can show the
 * pending organization and select the new one when it is created.
 */
export function CreateOrganizationDialog({
  create,
  onClose,
}: {
  create: ReturnType<typeof useCreateWorkspace>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [validation, setValidation] = useState(false);
  return (
    <SheetDialog title={t("organization.create")} onClose={onClose}>
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
        {create.error && (
          <p role="alert" className="alert">
            {t(errorKey(create.error))}
          </p>
        )}
        <Button disabled={busy}>
          {t(create.isPending ? "working" : "organization.create")}
        </Button>
      </form>
    </SheetDialog>
  );
}

/** Issues an expiring invitation link; the link is shown once. */
export function InviteMemberDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const formatDate = useInviteDateFormat();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceInviteInput["role"]>("member");
  const [validation, setValidation] = useState(false);
  const [issued, setIssued] = useState<IssuedInviteLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const issue = useIssueWorkspaceInvite(workspace.id, {
    onStart: () => {
      setIssued(null);
      setCopied(null);
    },
    onIssued: setIssued,
  });
  return (
    <SheetDialog title={t("organization.invite")} onClose={onClose}>
      <p className="section-hint">{t("organization.inviteHint")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = workspaceInviteInputSchema.safeParse({ email, role });
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
            {ROLES.map((value) => (
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
          <p
            role={issued.emailDelivery === "failed" ? "alert" : "status"}
            data-testid="invite-email-delivery"
          >
            {t(`organization.emailDelivery.${issued.emailDelivery}`)}
          </p>
          <p className="quiet">
            {t("organization.expires", {
              date: formatDate(issued.expiresAt),
            })}
          </p>
          <Label htmlFor="issued-invite">{t("organization.copyLink")}</Label>
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
  );
}
