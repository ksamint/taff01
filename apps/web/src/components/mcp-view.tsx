"use client";
import "../styles/mcp.css";

import {
  type AgentToken,
  agentTokenListSchema,
  createAgentTokenSchema,
  type IssuedAgentToken,
  type Locale,
  mcpCallListSchema,
  type Scope,
  scopeSchema,
} from "@taff/schemas";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../lib/api";
import {
  agentTokensKey,
  mcpCallsKey,
  useCreateAgentToken,
  useRegenerateAgentToken,
  useRestoreAgentToken,
  useRevokeAgentToken,
} from "../lib/mutations/mcp";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers } from "../lib/queries";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";
import { Switch } from "./ui/switch";

/**
 * Tools the MCP server exposes, as [tool name, `mcp.toolNames.*` key].
 * Keep it a flat array: other milestones append tools here.
 */
export const TOOLS: readonly (readonly [string, string])[] = [
  ["tasks.list", "listTasks"],
  ["tasks.create", "createTask"],
  ["tasks.update", "updateTask"],
  ["tasks.edit", "editTask"],
  ["tasks.comments.list", "readComments"],
  ["tasks.comments.add", "addComment"],
  ["projects.list", "readProjects"],
  ["search.query", "search"],
  ["quickadd.parse", "parseDraft"],
  ["calendar.list", "calendarList"],
  ["calendar.set", "calendarSet"],
  ["calendar.schedule", "schedule"],
  ["inbox.request_review", "requestReview"],
  ["runs.get", "readRun"],
  ["runs.start", "startRun"],
  ["runs.control", "controlRun"],
  ["runs.event", "recordProgress"],
  ["files.attach", "attachFile"],
  ["runs.submit", "submitRun"],
  ["grants.request", "requestGrant"],
  ["timeline.get", "readTimeline"],
  ["tasks.plan", "planTask"],
  ["dependencies.add", "addDependency"],
  ["dependencies.remove", "removeDependency"],
  ["companies.list", "listCompanies"],
  ["contacts.list", "listContacts"],
  ["contacts.get", "readContact"],
  ["relations.get", "readRelations"],
  ["brief.get", "readBrief"],
  ["suggestions.create", "proposeChange"],
];
/** Third-party tools the prototype lists. None is connected yet. */
const INTEGRATIONS = ["github", "figma", "slack", "gcal"] as const;
const SCOPES = scopeSchema.options as Scope[];

const noSubscription = () => () => {};

type Confirm = { kind: "regenerate" | "revoke"; token: AgentToken };

/** Prototype v2 MCP page: phone lines 910–988, desktop Me › 設定 › MCP. */
export function McpView({ origin }: { origin?: string }) {
  const { me, workspace, confirmed } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const isAdmin = workspace.role === "admin";
  const members = useMembers(workspace.id);
  const tokens = useQuery({
    queryKey: agentTokensKey(workspace.id),
    queryFn: async () =>
      agentTokenListSchema.parse(
        await request(`/api/agent-tokens?workspaceId=${workspace.id}`),
      ),
    retry: false,
  });
  const calls = useQuery({
    queryKey: mcpCallsKey(workspace.id),
    enabled: isAdmin,
    queryFn: async () =>
      mcpCallListSchema.parse(
        await request(`/api/mcp-calls?workspaceId=${workspace.id}`),
      ),
    retry: false,
  });
  const [issued, setIssued] = useState<IssuedAgentToken | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["tasks:read"]);
  const [validationError, setValidationError] = useState(false);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const showIssued = (token: IssuedAgentToken) => {
    setIssued(token);
    setTokenCopied(false);
  };
  const create = useCreateAgentToken(workspace, {
    onIssued: (token) => {
      showIssued(token);
      setName("");
    },
  });
  const regenerate = useRegenerateAgentToken(workspace, {
    onIssued: (token) => {
      showIssued(token);
      showToast(t("mcp.toast.regenerated"));
    },
  });
  const restore = useRestoreAgentToken(workspace.id);
  const revoke = useRevokeAgentToken(workspace.id, {
    onStart: () => setConfirm(null),
    onRevoked: (token) =>
      showToast(t("mcp.toast.revoked", { name: token.name }), {
        label: t("mcp.undo"),
        run: () =>
          restore.mutate(token.id, {
            onSuccess: () =>
              showToast(t("mcp.toast.restored", { name: token.name })),
            onError: (error) => showToast(t(errorKey(error))),
          }),
      }),
  });
  const agents =
    members.data?.filter((member) => member.kind === "agent") ?? [];
  const selectedAgentId = agents.some((agent) => agent.id === memberId)
    ? memberId
    : (agents[0]?.id ?? "");
  const agentName = (id: string) =>
    agents.find((agent) => agent.id === id)?.name ?? t("unknownMember");
  const browserOrigin = useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "",
  );
  const base = origin ?? browserOrigin;
  const endpoint = `${base}/mcp`;
  const forbidden =
    tokens.error instanceof ApiError && tokens.error.status === 403;
  const config = JSON.stringify(
    {
      mcpServers: {
        taff: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${issued?.token ?? "<token>"}` },
        },
      },
    },
    null,
    2,
  );
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: me.user.tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const activeCount =
    tokens.data?.filter((token) => !token.revokedAt).length ?? 0;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createAgentTokenSchema.safeParse({
      workspaceId: workspace.id,
      memberId: selectedAgentId,
      name,
      scopes,
    });
    setValidationError(!parsed.success);
    if (parsed.success && confirmed && isAdmin && !busy && agents.length)
      create.mutate(parsed.data);
  }
  async function copy(value: string, onCopied?: () => void) {
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.();
      showToast(t("mcp.copied"));
    } catch {
      setTokenCopied(false);
      showToast(t("organization.copyFailed"));
    }
  }
  const mutationError = [create, regenerate, revoke, restore].find(
    (mutation) => mutation.isError,
  )?.error;

  const tools = (
    <section className="mcp-section" aria-labelledby="mcp-tools-heading">
      <h2 id="mcp-tools-heading" className="mcp-label mcp-list-label">
        {t("mcp.tools")} · {TOOLS.length}
      </h2>
      <ul className="mcp-rows">
        {TOOLS.map(([tool, key]) => (
          <li key={tool} className="mcp-row">
            <span className="mcp-row-copy">
              <code className="mcp-mono">{tool}</code>
              <span className="mcp-row-sub">{t(`mcp.toolNames.${key}`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
  const integrations = (
    <section className="mcp-section" aria-labelledby="mcp-integrations-heading">
      <h2 id="mcp-integrations-heading" className="mcp-label mcp-list-label">
        {t("mcp.connectTools")}
      </h2>
      <p className="mcp-section-hint">{t("mcp.integrationsHint")}</p>
      <ul className="mcp-rows">
        {INTEGRATIONS.map((key) => {
          const label = t(`mcp.integrations.${key}`);
          return (
            <li key={key} className="mcp-row" data-testid="mcp-integration">
              <span className="mcp-tile" aria-hidden="true">
                {label.slice(0, 1)}
              </span>
              <span className="mcp-row-copy">
                <span className="mcp-row-title">{label}</span>
                <span className="mcp-row-sub">
                  {t(`mcp.integrations.${key}Hint`)}
                </span>
              </span>
              <span className="mcp-state">{t("mcp.notConnected")}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="mcp-view">
      <header className="mcp-backbar">
        <Link href="/me" className="button button-quiet mcp-back">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("mcp.back")}
        </Link>
      </header>
      <div className="mcp-page">
        <div className="mcp-intro">
          <p className="mcp-eyebrow">{t("me.settings")}</p>
          <h1>{t("mcp.title")}</h1>
          <p className="mcp-lede">{t("mcp.subtitle")}</p>
          {tokens.isSuccess && (
            <p className="mcp-status">
              <span className="mcp-dot" aria-hidden="true" />
              {t("mcp.activeTokens", { count: activeCount })}
            </p>
          )}
        </div>

        <section className="mcp-settings" aria-labelledby="mcp-server-heading">
          <h2 id="mcp-server-heading" className="sr-only">
            {t("mcp.title")}
          </h2>
          <div className="mcp-field">
            <span className="mcp-label" id="mcp-endpoint-label">
              {t("mcp.endpoint")}
            </span>
            <div className="mcp-field-body">
              <div className="mcp-copy-row">
                <code
                  data-testid="mcp-endpoint"
                  title={endpoint}
                  aria-labelledby="mcp-endpoint-label"
                >
                  {endpoint}
                </code>
                <Button
                  type="button"
                  className="button-quiet mcp-icon-button"
                  aria-label={t("mcp.copyEndpoint")}
                  onClick={() => void copy(endpoint)}
                >
                  <Copy size={16} aria-hidden="true" />
                </Button>
              </div>
              <span className="mcp-note">{t("mcp.transport")}</span>
            </div>
          </div>
          <div className="mcp-field">
            <span className="mcp-label">{t("mcp.auth.title")}</span>
            <div className="mcp-field-body">
              <p className="mcp-body">{t("mcp.endpointHint")}</p>
            </div>
          </div>
          <div className="mcp-field">
            <span className="mcp-label" id="mcp-config-label">
              {t("mcp.clientConfig")}
            </span>
            <div className="mcp-field-body">
              <div className="mcp-config-wrap">
                <pre className="mcp-config" aria-labelledby="mcp-config-label">
                  {config}
                </pre>
                <Button
                  type="button"
                  className="button-quiet mcp-icon-button"
                  aria-label={t("mcp.copyConfig")}
                  onClick={() => void copy(config)}
                >
                  <Copy size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {forbidden ? (
          <>
            <p className="mcp-notice alert" role="status">
              {t("mcp.adminOnly")}
            </p>
            {tools}
            {integrations}
          </>
        ) : (
          <>
            {isAdmin && (
              <section
                className="mcp-section mcp-pat"
                aria-labelledby="mcp-pat-heading"
              >
                <h2 id="mcp-pat-heading" className="mcp-label">
                  {t("mcp.personalToken")}
                </h2>
                <p className="mcp-note">{t("mcp.personalTokenHint")}</p>
                {issued && (
                  <div className="mcp-issued" data-testid="issued-token">
                    <p className="mcp-show-once">{t("mcp.showOnce")}</p>
                    <div className="mcp-copy-row">
                      <code className="mcp-token-value">{issued.token}</code>
                      <Button
                        type="button"
                        className="button-quiet mcp-icon-button"
                        aria-label={t(
                          tokenCopied ? "mcp.copied" : "mcp.copyToken",
                        )}
                        onClick={() =>
                          void copy(issued.token, () => setTokenCopied(true))
                        }
                      >
                        {tokenCopied ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          <Copy size={16} aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    <p className="mcp-note">
                      {issued.name} · {agentName(issued.memberId)}
                    </p>
                    <Button
                      type="button"
                      className="button-quiet mcp-text-button"
                      onClick={() => setIssued(null)}
                    >
                      {t("mcp.dismiss")}
                    </Button>
                  </div>
                )}
                <form className="mcp-form" onSubmit={submit} noValidate>
                  <h3 className="mcp-form-title">{t("mcp.newToken")}</h3>
                  <div className="field">
                    <Label htmlFor="token-name">{t("mcp.tokenName")}</Label>
                    <Input
                      id="token-name"
                      data-testid="token-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={100}
                      required
                      placeholder={t("mcp.tokenNamePlaceholder")}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="token-agent">{t("agent")}</Label>
                    {members.isPending ? (
                      <p role="status">{t("loading")}</p>
                    ) : members.isError ? (
                      <p role="alert" className="alert">
                        {t(errorKey(members.error))}
                      </p>
                    ) : !agents.length ? (
                      <div data-testid="mcp-no-agents" role="status">
                        <p>{t("oauth.noAgent")}</p>
                        {isAdmin && (
                          <Link className="button" href="/orgs">
                            {t("organization.addAgent")}
                          </Link>
                        )}
                      </div>
                    ) : (
                      <select
                        id="token-agent"
                        data-testid="token-agent"
                        value={selectedAgentId}
                        onChange={(event) => setMemberId(event.target.value)}
                        disabled={!agents.length}
                      >
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <fieldset className="mcp-scopes">
                    <legend className="mcp-label">{t("mcp.scopes")}</legend>
                    {SCOPES.map((scope) => (
                      <label key={scope} className="mcp-scope">
                        <span className="mcp-row-copy">
                          <span className="mcp-row-title">
                            {t(`mcp.scope.${scope}`, { nsSeparator: false })}
                          </span>
                          <code className="mcp-row-sub mcp-mono">{scope}</code>
                        </span>
                        <Switch
                          checked={scopes.includes(scope)}
                          onChange={(event) =>
                            setScopes((current) =>
                              event.target.checked
                                ? [...current, scope]
                                : current.filter((item) => item !== scope),
                            )
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                  {(validationError || create.isError) && (
                    <p className="alert" role="alert">
                      {t(
                        validationError
                          ? "errors.invalid_input"
                          : errorKey(create.error),
                      )}
                    </p>
                  )}
                  {(!confirmed || busy) && (
                    <p role="status">
                      {t(
                        !confirmed ? "organization.sessionPending" : "working",
                      )}
                    </p>
                  )}
                  <Button
                    data-testid="token-submit"
                    className="button-primary mcp-submit"
                    type="submit"
                    disabled={
                      busy || !confirmed || !agents.length || members.isError
                    }
                  >
                    {t(create.isPending ? "working" : "mcp.createToken")}
                  </Button>
                </form>
              </section>
            )}

            <section
              className="mcp-section"
              data-testid="mcp-connected-apps"
              aria-labelledby="mcp-clients-heading"
            >
              <h2 id="mcp-clients-heading" className="mcp-label mcp-list-label">
                {t(isAdmin ? "mcp.connectedClients" : "mcp.connectedApps")}
              </h2>
              {mutationError && !create.isError && (
                <p className="mcp-notice alert" role="alert">
                  {t(errorKey(mutationError))}
                </p>
              )}
              {tokens.isPending ? (
                <p className="mcp-notice" aria-live="polite">
                  {t("loading")}
                </p>
              ) : tokens.isError ? (
                <p className="mcp-notice alert" role="alert">
                  {t(errorKey(tokens.error))}
                </p>
              ) : tokens.data.length === 0 ? (
                <p className="mcp-notice">{t("mcp.noTokens")}</p>
              ) : (
                <ul className="mcp-rows">
                  {tokens.data.map((token) => {
                    const pending = token.id.startsWith("optimistic:");
                    return (
                      <li
                        key={token.id}
                        className="mcp-client"
                        data-testid="token-card"
                      >
                        <details className="mcp-client-details">
                          <summary className="mcp-client-summary">
                            <span className="mcp-tile" aria-hidden="true">
                              <Cpu size={16} />
                            </span>
                            <span className="mcp-row-copy">
                              <h3 className="mcp-row-title">{token.name}</h3>
                              <span className="mcp-row-sub">
                                {agentName(token.memberId)}
                                {token.prefix && (
                                  <>
                                    {" · "}
                                    <code className="mcp-mono">
                                      {token.prefix}…
                                    </code>
                                  </>
                                )}
                              </span>
                            </span>
                            <span
                              className="mcp-state"
                              data-state={
                                pending
                                  ? "pending"
                                  : token.revokedAt
                                    ? "revoked"
                                    : "active"
                              }
                            >
                              {pending
                                ? t("working")
                                : token.revokedAt
                                  ? t("mcp.revoked")
                                  : t("mcp.scopeSummary", {
                                      granted: token.scopes.length,
                                      total: SCOPES.length,
                                    })}
                            </span>
                            <ChevronDown
                              className="mcp-chevron"
                              size={16}
                              aria-hidden="true"
                            />
                          </summary>
                          <div className="mcp-client-body">
                            {token.oauthClientId && isAdmin && (
                              <p className="mcp-note">
                                {t("mcp.approvedBy", {
                                  name:
                                    members.data?.find(
                                      (member) => member.id === token.createdBy,
                                    )?.name ?? t("unknownMember"),
                                })}
                              </p>
                            )}
                            <p className="mcp-note">
                              {token.lastUsedAt
                                ? t("mcp.lastUsed", {
                                    date: when(token.lastUsedAt),
                                  })
                                : t("mcp.neverUsed")}
                              {" · "}
                              {t(
                                token.oauthClientId
                                  ? "mcp.approved"
                                  : "mcp.created",
                                {
                                  date: when(token.createdAt),
                                },
                              )}
                            </p>
                            <ul
                              className="mcp-granted"
                              aria-label={t("mcp.scopes")}
                            >
                              {SCOPES.map((scope) => {
                                const granted = token.scopes.includes(scope);
                                return (
                                  <li
                                    key={scope}
                                    className="mcp-scope"
                                    data-granted={granted}
                                  >
                                    <span className="mcp-row-copy">
                                      <span className="mcp-row-title">
                                        {t(`mcp.scope.${scope}`, {
                                          nsSeparator: false,
                                        })}
                                      </span>
                                      <code className="mcp-row-sub mcp-mono">
                                        {scope}
                                      </code>
                                    </span>
                                    <span className="mcp-grant">
                                      {granted ? (
                                        <Check size={16} aria-hidden="true" />
                                      ) : (
                                        <X size={16} aria-hidden="true" />
                                      )}
                                      <span className="sr-only">
                                        {t(
                                          granted
                                            ? "mcp.granted"
                                            : "mcp.notGranted",
                                        )}
                                      </span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            {!token.revokedAt && !pending && (
                              <div className="mcp-actions">
                                {isAdmin && (
                                  <Button
                                    type="button"
                                    className="button-quiet mcp-text-button"
                                    data-testid="token-regenerate"
                                    disabled={busy}
                                    onClick={() =>
                                      setConfirm({ kind: "regenerate", token })
                                    }
                                  >
                                    <RefreshCw size={16} aria-hidden="true" />
                                    {t("mcp.regenerate")}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  className="button-quiet mcp-text-button"
                                  data-testid="token-revoke"
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirm({ kind: "revoke", token })
                                  }
                                >
                                  <X size={16} aria-hidden="true" />
                                  {t("mcp.revokeAccess")}
                                </Button>
                              </div>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {tools}

            {isAdmin && (
              <section
                className="mcp-section"
                aria-labelledby="mcp-calls-heading"
              >
                <h2 id="mcp-calls-heading" className="mcp-label mcp-list-label">
                  {t("mcp.callLog")}
                </h2>
                {calls.isPending ? (
                  <p className="mcp-notice" aria-live="polite">
                    {t("loading")}
                  </p>
                ) : calls.isError ? (
                  <p className="mcp-notice alert" role="alert">
                    {t(errorKey(calls.error))}
                  </p>
                ) : calls.data.length === 0 ? (
                  <p className="mcp-notice">{t("mcp.noCalls")}</p>
                ) : (
                  <ul className="mcp-rows">
                    {calls.data.map((call) => (
                      <li key={call.id} className="mcp-row mcp-call">
                        <span className="mcp-row-copy">
                          <code className="mcp-mono mcp-row-title">
                            {call.tool ?? "—"}
                          </code>
                          <dl className="mcp-call-meta">
                            <div>
                              <dt className="sr-only">{t("mcp.method")}</dt>
                              <dd>
                                <code className="mcp-mono">{call.method}</code>
                              </dd>
                            </div>
                            <div>
                              <dt className="sr-only">{t("mcp.token")}</dt>
                              <dd>
                                {tokens.data?.find(
                                  (token) => token.id === call.tokenId,
                                )?.name ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="sr-only">{t("mcp.status")}</dt>
                              <dd data-status={call.status}>
                                {t(`mcp.callStatus.${call.status}`)}
                              </dd>
                            </div>
                            <div>
                              <dt className="sr-only">{t("mcp.duration")}</dt>
                              <dd>
                                {new Intl.NumberFormat(locale, {
                                  style: "unit",
                                  unit: "millisecond",
                                }).format(call.durationMs)}
                              </dd>
                            </div>
                          </dl>
                        </span>
                        <time className="mcp-note" dateTime={call.createdAt}>
                          {when(call.createdAt)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {integrations}
          </>
        )}
      </div>

      {confirm && (
        <SheetDialog
          className="mcp-confirm"
          title={t(
            confirm.kind === "regenerate"
              ? "mcp.regenerateTitle"
              : "mcp.revokeTitle",
            { name: confirm.token.name },
          )}
          onClose={() => setConfirm(null)}
        >
          <p className="mcp-body">
            {t(
              confirm.kind === "regenerate"
                ? "mcp.regenerateHint"
                : "mcp.revokeHint",
            )}
          </p>
          <div className="mcp-actions mcp-confirm-actions">
            <Button
              type="button"
              className="button-quiet"
              onClick={() => setConfirm(null)}
            >
              {t("mcp.cancel")}
            </Button>
            <Button
              type="button"
              className="button-primary"
              data-testid="token-confirm"
              disabled={busy}
              onClick={() => {
                if (confirm.kind === "revoke") revoke.mutate(confirm.token.id);
                else {
                  regenerate.mutate(confirm.token);
                  setConfirm(null);
                }
              }}
            >
              {t(
                confirm.kind === "regenerate"
                  ? "mcp.regenerate"
                  : "mcp.confirmRevoke",
              )}
            </Button>
          </div>
        </SheetDialog>
      )}
    </div>
  );
}
