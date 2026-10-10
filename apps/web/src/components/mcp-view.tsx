"use client";

import {
  type AgentToken,
  agentTokenListSchema,
  type CreateAgentToken,
  createAgentTokenSchema,
  type IssuedAgentToken,
  issuedAgentTokenSchema,
  mcpCallListSchema,
  type Scope,
  scopeSchema,
} from "@taff/schemas";
import {
  type PrototypeLocale,
  presentPrototypeField,
} from "@taff/schemas/prototype-data";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Copy, Cpu } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../lib/api";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers } from "../lib/queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const TOOLS = [
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
] as const;
const SCOPES = scopeSchema.options as Scope[];

export function McpView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  const members = useMembers(workspace.id);
  const tokensKey = ["agent-tokens", workspace.id];
  const callsKey = ["mcp-calls", workspace.id];
  const tokens = useQuery({
    queryKey: tokensKey,
    queryFn: async () =>
      agentTokenListSchema.parse(
        await request(`/api/agent-tokens?workspaceId=${workspace.id}`),
      ),
    retry: false,
  });
  const calls = useQuery({
    queryKey: callsKey,
    queryFn: async () =>
      mcpCallListSchema.parse(
        await request(`/api/mcp-calls?workspaceId=${workspace.id}`),
      ),
    retry: false,
  });
  const [issued, setIssued] = useState<IssuedAgentToken | null>(null);
  const [copied, setCopied] = useState<"endpoint" | "config" | "token" | null>(
    null,
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["tasks:read"]);
  const [validationError, setValidationError] = useState(false);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const create = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: CreateAgentToken) =>
      issuedAgentTokenSchema.parse(
        await request("/api/agent-tokens", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = await snapshotQueries(client, [tokensKey]);
      const id = `optimistic:${crypto.randomUUID()}`;
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) => [
        {
          ...body,
          id,
          createdBy: workspace.memberId,
          prefix: "",
          createdAt: new Date().toISOString(),
          revokedAt: null,
          lastUsedAt: null,
        },
        ...current,
      ]);
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (token, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const { token: _secret, ...metadata } = token;
      client.setQueryData<AgentToken[]>(tokensKey, (current) =>
        current?.map((item) => (item.id === context.id ? metadata : item)),
      );
      setIssued(token);
      setCopied(null);
      setName("");
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
  const revoke = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (id: string) =>
      request<AgentToken>(`/api/agent-tokens/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const snapshot = await snapshotQueries(client, [tokensKey]);
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) =>
        current.map((token) =>
          token.id === id
            ? { ...token, revokedAt: new Date().toISOString() }
            : token,
        ),
      );
      setConfirming(null);
      return snapshot;
    },
    onError: (_, __, context) => {
      restoreQueries(client, context);
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
  const agents =
    members.data?.filter((member) => member.kind === "agent") ?? [];
  const endpoint =
    typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`;
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createAgentTokenSchema.safeParse({
      workspaceId: workspace.id,
      memberId: memberId || agents[0]?.id,
      name,
      scopes,
    });
    setValidationError(!parsed.success);
    if (parsed.success) create.mutate(parsed.data);
  }
  async function copy(value: string, target: "endpoint" | "config" | "token") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
    } catch {
      setCopied(null);
    }
  }
  const catalog = (
    <details className="mcp-catalog">
      <summary className="mcp-section-label">
        <span>{t("mcp.tools")}</span>
        <span>{TOOLS.length}</span>
        <ChevronDown className="mcp-chevron" size={16} aria-hidden="true" />
      </summary>
      <ul className="mcp-tool-list">
        {TOOLS.map(([name, key]) => (
          <li key={name}>
            <code>{name}</code>
            <p>{t(`mcp.toolNames.${key}`)}</p>
          </li>
        ))}
      </ul>
    </details>
  );
  return (
    <div className="mcp-view">
      {/* Source: team-tasks.dc.html 711–790. Unsupported OAuth/client health
          and mutable tool switches are replaced by the actual PAT controls. */}
      <header className="mcp-backbar">
        <Link href="/me" className="button button-quiet mcp-back">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("mcp.back")}
        </Link>
      </header>
      <div className="mcp-intro">
        <p className="mcp-settings-label">{t("me.settings")}</p>
        <h1>{t("mcp.title")}</h1>
        <p className="mcp-introduction">{t("mcp.subtitle")}</p>
        {!tokens.isPending && !tokens.isError && (
          <p className="mcp-token-count">
            {t("mcp.tokens")} · {tokens.data.length}
          </p>
        )}
      </div>
      <div className="mcp-connection">
        <section className="mcp-block" aria-labelledby="endpoint-heading">
          <h2 id="endpoint-heading" className="mcp-section-label">
            {t("mcp.endpoint")}
          </h2>
          <div className="mcp-copy-row">
            <code data-testid="mcp-endpoint" title={endpoint}>
              {endpoint}
            </code>
            <Button
              type="button"
              className="button-quiet mcp-copy-button"
              aria-label={t("mcp.copyEndpoint")}
              onClick={() => void copy(endpoint, "endpoint")}
            >
              <Copy size={16} aria-hidden="true" />
            </Button>
          </div>
          {copied === "endpoint" && (
            <p className="mcp-copy-feedback" role="status">
              {t("mcp.copied")}
            </p>
          )}
          <p className="mcp-endpoint-label">{t("mcp.endpointUrl")}</p>
          <p className="mcp-auth-body">{t("mcp.endpointHint")}</p>
        </section>
        <section className="mcp-block" aria-labelledby="config-heading">
          <h2 id="config-heading" className="mcp-section-label">
            {t("mcp.clientConfig")}
          </h2>
          <div className="mcp-config-wrap">
            <pre className="mcp-config">{config}</pre>
            <Button
              type="button"
              className="button-quiet mcp-copy-button"
              aria-label={t("mcp.copyConfig")}
              onClick={() => void copy(config, "config")}
            >
              <Copy size={16} aria-hidden="true" />
            </Button>
          </div>
          {copied === "config" && (
            <p className="mcp-copy-feedback" role="status">
              {t("mcp.copied")}
            </p>
          )}
        </section>
      </div>
      {forbidden ? (
        <>
          <p className="mcp-notice alert" role="status">
            {t("mcp.adminOnly")}
          </p>
          {catalog}
        </>
      ) : (
        <>
          <section
            className="mcp-token-create"
            aria-labelledby="new-token-heading"
          >
            <h2 id="new-token-heading" className="mcp-section-label">
              {t("mcp.newToken")}
            </h2>
            {issued && (
              <div className="mcp-issued" data-testid="issued-token">
                <p className="mcp-show-once">{t("mcp.showOnce")}</p>
                <code className="mcp-token-value">{issued.token}</code>
                <div className="mcp-actions">
                  <Button
                    type="button"
                    className="button-quiet"
                    onClick={() => void copy(issued.token, "token")}
                  >
                    <Copy size={16} aria-hidden="true" />
                    {t(copied === "token" ? "mcp.copied" : "mcp.copyToken")}
                  </Button>
                  <Button
                    type="button"
                    className="button-quiet"
                    onClick={() => setIssued(null)}
                  >
                    {t("mcp.dismiss")}
                  </Button>
                </div>
              </div>
            )}
            <form onSubmit={submit} noValidate>
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
                <select
                  id="token-agent"
                  data-testid="token-agent"
                  value={memberId || agents[0]?.id || ""}
                  onChange={(event) => setMemberId(event.target.value)}
                  disabled={!agents.length}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {presentPrototypeField(
                        agent.id,
                        "name",
                        agent.name,
                        locale,
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="mcp-scopes">
                <legend className="mcp-section-label">{t("mcp.scopes")}</legend>
                {SCOPES.map((scope) => (
                  <label key={scope}>
                    <span>{t(`mcp.scope.${scope}`)}</span>
                    <code>{scope}</code>
                    <input
                      type="checkbox"
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
              <Button
                data-testid="token-submit"
                className="button-primary"
                type="submit"
                disabled={busy || !agents.length}
              >
                {t(create.isPending ? "working" : "mcp.createToken")}
              </Button>
            </form>
          </section>
          <section className="mcp-tokens" aria-labelledby="tokens-heading">
            <h2
              id="tokens-heading"
              className="mcp-section-label mcp-list-heading"
            >
              {t("mcp.tokens")}
            </h2>
            {revoke.isError && (
              <p className="mcp-notice alert" role="alert">
                {t(errorKey(revoke.error))}
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
              <ul className="mcp-token-list">
                {tokens.data.map((token) => (
                  <li key={token.id} data-testid="token-card">
                    <details className="mcp-token-details">
                      <summary>
                        <span className="mcp-client-icon">
                          <Cpu size={16} aria-hidden="true" />
                        </span>
                        <span className="mcp-client-copy">
                          <h3>{token.name}</h3>
                          <span>
                            {agents.find((agent) => agent.id === token.memberId)
                              ?.name ?? t("unknownMember")}{" "}
                            · <code>{token.prefix}…</code>
                          </span>
                        </span>
                        <span
                          className={`mcp-token-state${!token.revokedAt && !token.id.startsWith("optimistic:") ? " is-active" : ""}`}
                        >
                          {t(
                            token.id.startsWith("optimistic:")
                              ? "working"
                              : token.revokedAt
                                ? "mcp.revoked"
                                : "mcp.active",
                          )}
                        </span>
                        <ChevronDown
                          className="mcp-chevron"
                          size={16}
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="mcp-client-body">
                        <p className="mcp-last-used">
                          {token.lastUsedAt
                            ? t("mcp.lastUsed", {
                                date: when(token.lastUsedAt),
                              })
                            : t("mcp.neverUsed")}
                        </p>
                        <ul className="mcp-granted-scopes">
                          {token.scopes.map((scope) => (
                            <li key={scope}>
                              <span>{t(`mcp.scope.${scope}`)}</span>
                              <code>{scope}</code>
                            </li>
                          ))}
                        </ul>
                        {!token.revokedAt &&
                          (confirming === token.id ? (
                            <div className="mcp-actions">
                              <Button
                                type="button"
                                className="button-primary"
                                disabled={busy}
                                onClick={() => revoke.mutate(token.id)}
                              >
                                {t("mcp.confirmRevoke")}
                              </Button>
                              <Button
                                type="button"
                                className="button-quiet"
                                onClick={() => setConfirming(null)}
                              >
                                {t("mcp.cancel")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              className="button-quiet"
                              disabled={
                                revoke.isPending ||
                                create.isPending ||
                                token.id.startsWith("optimistic:")
                              }
                              onClick={() => setConfirming(token.id)}
                            >
                              {t("mcp.revoke")}
                            </Button>
                          ))}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {catalog}
          <section className="mcp-calls" aria-labelledby="calls-heading">
            <h2
              id="calls-heading"
              className="mcp-section-label mcp-list-heading"
            >
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
              <ul className="mcp-call-list">
                {calls.data.map((call) => (
                  <li key={call.id}>
                    <div className="mcp-call-copy">
                      <code>{call.tool ?? "—"}</code>
                      <dl>
                        <div>
                          <dt>{t("mcp.method")}</dt>
                          <dd>
                            <code>{call.method}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>{t("mcp.status")}</dt>
                          <dd>{t(`mcp.callStatus.${call.status}`)}</dd>
                        </div>
                        <div>
                          <dt>{t("mcp.duration")}</dt>
                          <dd>
                            {new Intl.NumberFormat(locale, {
                              style: "unit",
                              unit: "millisecond",
                            }).format(call.durationMs)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <time dateTime={call.createdAt}>
                      {when(call.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
