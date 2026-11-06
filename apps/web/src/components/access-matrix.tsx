"use client";
import "../styles/access-matrix.css";
import {
  type AgentProfile,
  type AgentTokenWorkspace,
  accessMatrixSchema,
  integrationPermissionExplanationSchema,
  type AccessMatrix as Matrix,
  type Member,
  type ReviewPolicy,
  systemAccessMatrixSchema,
} from "@taff/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import {
  useSaveAgentProfile,
  useSetAgentPermission,
} from "../lib/mutations/agents";
import { useChangeMemberRole } from "../lib/mutations/organizations";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { TokenPolicyControl } from "./token-policy-control";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

const tabs = ["people", "agents", "tokens", "apps"] as const;
function MatrixTable({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className="access-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="access-table">{children}</table>
    </div>
  );
}
export function AccessMatrix() {
  const { workspace, me, confirmed } = useWorkspace();
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof tabs)[number]>("people");
  const admin = workspace.role === "admin" || !!me.user.systemAdmin;
  const matrix = useQuery({
    queryKey: ["access-matrix", workspace.id],
    enabled: confirmed && admin,
    queryFn: async () =>
      accessMatrixSchema.parse(
        await request(`/api/workspaces/${workspace.id}/access-matrix`),
      ),
    retry: false,
  });
  return (
    <div className="access-page" data-testid="access-matrix">
      <Link className="text-link" href="/orgs">
        {t("mcp.back")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("access.title")}</h1>
      </section>
      {!admin ? (
        <p role="alert" data-testid="access-forbidden">
          {t("errors.forbidden")}
        </p>
      ) : (
        <>
          <div
            className="segmented access-tabs"
            role="tablist"
            aria-label={t("access.title")}
          >
            {tabs.map((item) => (
              <Button
                key={item}
                role="tab"
                id={`access-tab-${item}`}
                aria-controls={`access-panel-${item}`}
                aria-selected={tab === item}
                tabIndex={tab === item ? 0 : -1}
                onKeyDown={(event) => {
                  const offset =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!offset) return;
                  event.preventDefault();
                  const next =
                    tabs[
                      (tabs.indexOf(item) + offset + tabs.length) % tabs.length
                    ];
                  setTab(next);
                  document.getElementById(`access-tab-${next}`)?.focus();
                }}
                onClick={() => setTab(item)}
              >
                {t(`access.${item}`)}
              </Button>
            ))}
          </div>
          {matrix.isPending && <p role="status">{t("loading")}</p>}
          {matrix.error && <p role="alert">{t(errorKey(matrix.error))}</p>}
          {matrix.data && (
            <section
              role="tabpanel"
              id={`access-panel-${tab}`}
              aria-labelledby={`access-tab-${tab}`}
            >
              {tab === "people" && <People data={matrix.data} />}
              {tab === "agents" && <Agents data={matrix.data} />}
              {tab === "tokens" && <TokenGrants data={matrix.data} />}
              {tab === "apps" && <Apps data={matrix.data} />}
            </section>
          )}
        </>
      )}
      {me.user.systemAdmin && (
        <Link className="text-link" href="/admin/access">
          {t("access.systemTitle")}
        </Link>
      )}
    </div>
  );
}
function People({ data }: { data: Matrix }) {
  const { t } = useTranslation();
  const { workspace, confirmed } = useWorkspace();
  const client = useQueryClient();
  const change = useChangeMemberRole(data.workspaceId);
  const [confirm, setConfirm] = useState<{
    member: Member;
    next: Member["role"];
  } | null>(null);
  const apply = (member: Member, next: Member["role"]) =>
    change.mutate(
      { id: member.id, next },
      {
        onSuccess: () => {
          setConfirm(null);
          if (member.id === workspace.memberId && next !== "admin") {
            showToast(t("access.updated"));
            return;
          }
          showToast(t("access.updated"), {
            label: t("mcp.undo"),
            run: () =>
              change.mutate(
                { id: member.id, next: member.role },
                {
                  onError: (error) => showToast(t(errorKey(error))),
                  onSettled: () =>
                    client.invalidateQueries({ queryKey: ["access-matrix"] }),
                },
              ),
          });
        },
        onError: (error) => showToast(t(errorKey(error))),
        onSettled: () =>
          client.invalidateQueries({ queryKey: ["access-matrix"] }),
      },
    );
  return (
    <>
      <MatrixTable label={t("access.people")}>
        <thead>
          <tr>
            <th>{t("access.name")}</th>
            <th>{t("access.role")}</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((member) => (
            <tr key={member.id}>
              <th scope="row">{member.name}</th>
              <td>
                <select
                  aria-label={t("organization.roleFor", { name: member.name })}
                  value={member.role}
                  disabled={!confirmed || change.isPending}
                  onChange={(event) => {
                    const next = event.target.value as Member["role"];
                    if (member.id === workspace.memberId && next !== "admin")
                      setConfirm({ member, next });
                    else apply(member, next);
                  }}
                >
                  {(["admin", "member", "guest"] as const).map((role) => (
                    <option key={role} value={role}>
                      {t(`organization.${role}`)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </MatrixTable>
      {confirm && (
        <SheetDialog
          title={t("access.selfDemotion")}
          onClose={() => setConfirm(null)}
        >
          <p>{t("access.selfDemotionHint")}</p>
          <Button
            disabled={change.isPending}
            onClick={() => apply(confirm.member, confirm.next)}
          >
            {t("access.confirm")}
          </Button>
          <Button onClick={() => setConfirm(null)}>{t("mcp.cancel")}</Button>
        </SheetDialog>
      )}
    </>
  );
}
function Agents({ data }: { data: Matrix }) {
  const { t } = useTranslation();
  return (
    <MatrixTable label={t("access.agents")}>
      <thead>
        <tr>
          <th>{t("access.name")}</th>
          <th>{t("agentProfile.permissions")}</th>
          <th>{t("agentProfile.policy")}</th>
          <th>{t("agentProfile.supervisor")}</th>
        </tr>
      </thead>
      <tbody>
        {data.agents.map((agent) => (
          <AgentRow key={agent.member.id} agent={agent} people={data.people} />
        ))}
      </tbody>
    </MatrixTable>
  );
}
function AgentRow({
  agent,
  people,
}: {
  agent: AgentProfile;
  people: Member[];
}) {
  const { t } = useTranslation();
  const { confirmed } = useWorkspace();
  const client = useQueryClient();
  const permission = useSetAgentPermission(agent.member.id);
  const profile = useSaveAgentProfile(agent.member.id);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["access-matrix"] });
  const error = (value: unknown) => showToast(t(errorKey(value)));
  return (
    <tr data-testid="access-agent" data-agent-id={agent.member.id}>
      <th scope="row">
        <Link href={`/agents/${agent.member.id}`}>{agent.member.name}</Link>
      </th>
      <td>
        {agent.permissions.map((item) => (
          <label className="access-permission" key={item.capability}>
            {t(`agentProfile.capability.${item.capability}`)}
            <select
              aria-label={t(`agentProfile.capability.${item.capability}`)}
              data-capability={item.capability}
              value={item.decision}
              disabled={!confirmed || !agent.canManage || permission.isPending}
              onChange={(event) =>
                permission.mutate(
                  {
                    capability: item.capability,
                    decision: event.target.value as typeof item.decision,
                  },
                  {
                    onError: error,
                    onSettled: refresh,
                    onSuccess: () =>
                      showToast(t("access.updated"), {
                        label: t("mcp.undo"),
                        run: () =>
                          permission.mutate(item, {
                            onError: error,
                            onSettled: refresh,
                          }),
                      }),
                  },
                )
              }
            >
              {(["allow", "ask", "deny"] as const).map((decision) => (
                <option key={decision} value={decision}>
                  {t(`agentProfile.decision.${decision}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </td>
      <td>
        <select
          aria-label={t("agentProfile.policy")}
          value={agent.reviewPolicy}
          disabled={!confirmed || !agent.canManage || profile.isPending}
          onChange={(event) =>
            profile.mutate(
              {
                supervisorId: agent.supervisorId,
                reviewPolicy: event.target.value as ReviewPolicy,
                maxCostMicros: agent.maxCostMicros,
                maxDurationMs: agent.maxDurationMs,
              },
              { onError: error, onSettled: refresh },
            )
          }
        >
          <option value="always_review">
            {t("agentProfile.alwaysReview")}
          </option>
          <option value="ask_only">{t("agentProfile.askOnly")}</option>
        </select>
      </td>
      <td>
        {people.find((person) => person.id === agent.supervisorId)?.name ??
          t("agentProfile.noSupervisor")}
      </td>
    </tr>
  );
}
function TokenGrants({ data }: { data: Matrix }) {
  const { t } = useTranslation();
  const { confirmed } = useWorkspace();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<{
    tokenId: string;
    grant: AgentTokenWorkspace;
  } | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function apply() {
    if (!confirm || busy || !confirmed) return;
    setBusy(true);
    try {
      const { grant, tokenId } = confirm;
      await request(
        grant.revokedAt
          ? `/api/agent-token-workspaces/${grant.id}/restore`
          : `/api/agent-tokens/${tokenId}/workspaces`,
        grant.revokedAt
          ? { method: "POST" }
          : {
              method: "PUT",
              body: JSON.stringify({
                workspaceId: data.workspaceId,
                memberId: grant.memberId,
                scopes: grant.scopes,
                revoked: true,
              }),
            },
      );
      await client.invalidateQueries({ queryKey: ["access-matrix"] });
      setConfirm(null);
    } catch (error) {
      showToast(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <MatrixTable label={t("access.tokens")}>
        <thead>
          <tr>
            <th>{t("access.name")}</th>
            <th>{t("access.origin")}</th>
            <th>{t("access.state")}</th>
            <th>{t("mcp.scopes")}</th>
            <th>{t("access.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {data.tokens.flatMap((token) =>
            token.grants.map((grant) => (
              <tr key={grant.id}>
                <th scope="row">{token.name}</th>
                <td>{t(`mcp.policy.${grant.origin}`)}</td>
                <td>
                  {t(
                    token.revokedAt || grant.revokedAt
                      ? "mcp.revoked"
                      : "mcp.grantActive",
                  )}
                  {grant.revokedBy && (
                    <p>
                      {t("mcp.policy.revokedBy", {
                        name:
                          data.people.find(
                            (person) => person.id === grant.revokedBy,
                          )?.name ?? grant.revokedBy,
                      })}
                    </p>
                  )}
                </td>
                <td>{grant.scopes.join(", ")}</td>
                <td>
                  <Button
                    disabled={!confirmed || busy || !!token.revokedAt}
                    onClick={() => setConfirm({ tokenId: token.id, grant })}
                  >
                    {t(
                      grant.revokedAt
                        ? "mcp.policy.restore"
                        : "mcp.revokeGrant",
                    )}
                  </Button>
                  <Button onClick={() => setExplain(token.id)}>
                    {t("access.explain")}
                  </Button>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </MatrixTable>
      {confirm && (
        <SheetDialog
          title={t(
            confirm.grant.revokedAt
              ? "mcp.policy.restoreTitle"
              : "mcp.revokeTitle",
            {
              name: data.tokens.find((token) => token.id === confirm.tokenId)
                ?.name,
            },
          )}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <Button
            data-testid="access-grant-confirm"
            disabled={busy || !confirmed}
            onClick={() => void apply()}
          >
            {t("access.confirm")}
          </Button>
          <Button disabled={busy} onClick={() => setConfirm(null)}>
            {t("mcp.cancel")}
          </Button>
        </SheetDialog>
      )}
      {explain && (
        <PermissionExplanation
          tokenId={explain}
          workspaceId={data.workspaceId}
          onClose={() => setExplain(null)}
        />
      )}
    </>
  );
}
function PermissionExplanation({
  workspaceId,
  tokenId,
  onClose,
}: {
  workspaceId: string;
  tokenId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const explanation = useQuery({
    queryKey: ["access-explanation", workspaceId, tokenId],
    queryFn: async () =>
      integrationPermissionExplanationSchema.parse(
        await request(
          `/api/admin/integrations/permissions?workspaceId=${workspaceId}&tokenId=${tokenId}`,
        ),
      ),
    retry: false,
  });
  return (
    <SheetDialog title={t("access.explain")} onClose={onClose}>
      {explanation.isPending && <p>{t("loading")}</p>}
      {explanation.error && (
        <p role="alert">{t(errorKey(explanation.error))}</p>
      )}
      {explanation.data && (
        <>
          <p>
            {t(explanation.data.active ? "mcp.grantActive" : "mcp.revoked")}
          </p>
          <h3>{t("mcp.scopes")}</h3>
          <p>{explanation.data.scopes.join(", ")}</p>
          <h3>{t("agentProfile.permissions")}</h3>
          <ul>
            {explanation.data.permissions.map((item) => (
              <li key={item.capability}>
                {t(`agentProfile.capability.${item.capability}`)} ·{" "}
                {t(`agentProfile.decision.${item.decision}`)}
              </li>
            ))}
          </ul>
          {explanation.data.review_policy && (
            <p>
              {t(
                explanation.data.review_policy === "always_review"
                  ? "agentProfile.alwaysReview"
                  : "agentProfile.askOnly",
              )}
            </p>
          )}
        </>
      )}
    </SheetDialog>
  );
}
function Apps({ data }: { data: Matrix }) {
  const { t } = useTranslation();
  const { confirmed } = useWorkspace();
  const client = useQueryClient();
  const [token, setToken] = useState<Matrix["oauthGrants"][number] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  async function revoke() {
    if (!token || busy || !confirmed) return;
    setBusy(true);
    try {
      await request(`/api/agent-tokens/${token.id}`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["access-matrix"] });
      setToken(null);
    } catch (error) {
      showToast(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <MatrixTable label={t("access.apps")}>
        <thead>
          <tr>
            <th>{t("access.name")}</th>
            <th>{t("mcp.scopes")}</th>
            <th>{t("access.state")}</th>
          </tr>
        </thead>
        <tbody>
          {data.oauthGrants.map((grant) => (
            <tr key={grant.id}>
              <th scope="row">{grant.clientName}</th>
              <td>{grant.scopes.join(", ")}</td>
              <td>
                {grant.revokedAt ? (
                  t("mcp.revoked")
                ) : (
                  <Button
                    disabled={busy || !confirmed}
                    onClick={() => setToken(grant)}
                  >
                    {t("mcp.revokeAccess")}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </MatrixTable>
      {token && (
        <SheetDialog
          title={t("mcp.revokeTitle", { name: token.clientName })}
          onClose={() => {
            if (!busy) setToken(null);
          }}
        >
          <p>{t("mcp.revokeHint")}</p>
          <Button disabled={busy || !confirmed} onClick={() => void revoke()}>
            {t("mcp.confirmRevoke")}
          </Button>
          <Button disabled={busy} onClick={() => setToken(null)}>
            {t("mcp.cancel")}
          </Button>
        </SheetDialog>
      )}
    </>
  );
}
export function SystemAccessMatrix() {
  const { me, confirmed } = useWorkspace();
  const { t } = useTranslation();
  const matrix = useQuery({
    queryKey: ["system-access-matrix"],
    enabled: confirmed && me.user.systemAdmin === true,
    queryFn: async () =>
      systemAccessMatrixSchema.parse(await request("/api/admin/access-matrix")),
    retry: false,
  });
  if (!me.user.systemAdmin) notFound();
  return (
    <div className="access-page" data-testid="system-access-matrix">
      <Link href="/orgs/access">{t("mcp.back")}</Link>
      <section className="page-heading">
        <h1>{t("access.systemTitle")}</h1>
      </section>
      {matrix.isPending && <p>{t("loading")}</p>}
      {matrix.error && <p role="alert">{t(errorKey(matrix.error))}</p>}
      {matrix.data && (
        <MatrixTable label={t("access.systemTitle")}>
          <thead>
            <tr>
              <th>{t("access.tokens")}</th>
              <th>{t("mcp.policy.allOrganizations")}</th>
              {matrix.data.organizations.map((org) => (
                <th key={org.id}>{org.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.data.tokens.map((token) => (
              <tr key={token.id}>
                <th scope="row">{token.name}</th>
                <td>
                  <TokenPolicyControl token={token} />
                </td>
                {matrix.data.organizations.map((org) => {
                  const grant = token.grants.find(
                    (item) => item.workspaceId === org.id,
                  );
                  return (
                    <td key={org.id}>
                      {t(
                        org.archivedAt
                          ? "access.archived"
                          : token.revokedAt || grant?.revokedAt
                            ? "mcp.revoked"
                            : grant
                              ? "mcp.grantActive"
                              : "mcp.notGranted",
                      )}
                      {grant?.revokedBy && (
                        <p>
                          {t("mcp.policy.revokedBy", { name: grant.revokedBy })}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </MatrixTable>
      )}
    </div>
  );
}
