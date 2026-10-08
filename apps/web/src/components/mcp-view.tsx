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
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  const locale = i18n.resolvedLanguage ?? me.user.locale;
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
  const [copied, setCopied] = useState(false);
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
      setCopied(false);
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
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("mcp.title")}</h1>
        <p className="task-count">{t("mcp.subtitle")}</p>
      </section>
      <details className="me-section">
        <summary>{t("mcp.tools")}</summary>
        <ul className="history-list">
          {TOOLS.map(([name, key]) => (
            <li key={name}>
              <code>{name}</code>
              <p className="quiet">{t(`mcp.toolNames.${key}`)}</p>
            </li>
          ))}
        </ul>
      </details>
      <section className="me-section" aria-labelledby="endpoint-heading">
        <h2 id="endpoint-heading">{t("mcp.endpoint")}</h2>
        <dl className="me-row">
          <dt>{t("mcp.endpointUrl")}</dt>
          <dd>
            <code data-testid="mcp-endpoint">{endpoint}</code>
          </dd>
        </dl>
        <p className="field-hint">{t("mcp.endpointHint")}</p>
      </section>
      {forbidden ? (
        <section className="me-section">
          <p className="alert" role="status">
            {t("mcp.adminOnly")}
          </p>
        </section>
      ) : (
        <>
          <section className="me-section" aria-labelledby="new-token-heading">
            <h2 id="new-token-heading">{t("mcp.newToken")}</h2>
            {issued && (
              <div className="panel token-reveal" data-testid="issued-token">
                <p className="label">{t("mcp.showOnce")}</p>
                <code className="token-value">{issued.token}</code>
                <div className="radio-row">
                  <Button type="button" onClick={() => void copy(issued.token)}>
                    {t(copied ? "mcp.copied" : "mcp.copyToken")}
                  </Button>
                  <Button
                    type="button"
                    className="button-quiet"
                    onClick={() => setIssued(null)}
                  >
                    {t("mcp.dismiss")}
                  </Button>
                </div>
                <p className="label">{t("mcp.clientConfig")}</p>
                <pre className="config-block">{config}</pre>
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
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <legend className="label">{t("mcp.scopes")}</legend>
                <div className="radio-row">
                  {SCOPES.map((scope) => (
                    <label key={scope}>
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
                      {t(`mcp.scope.${scope}`)}
                    </label>
                  ))}
                </div>
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
          <section className="me-section" aria-labelledby="tokens-heading">
            <h2 id="tokens-heading">{t("mcp.tokens")}</h2>
            {tokens.isPending ? (
              <p aria-live="polite">{t("loading")}</p>
            ) : tokens.isError ? (
              <p className="alert" role="alert">
                {t(errorKey(tokens.error))}
              </p>
            ) : tokens.data.length === 0 ? (
              <p className="section-hint">{t("mcp.noTokens")}</p>
            ) : (
              <ul className="task-list">
                {tokens.data.map((token) => (
                  <li
                    key={token.id}
                    className="task-card"
                    data-testid="token-card"
                  >
                    <div className="task-card-top">
                      <span
                        className={`status ${token.revokedAt ? "" : "status-done"}`}
                      >
                        {t(
                          token.id.startsWith("optimistic:")
                            ? "working"
                            : token.revokedAt
                              ? "mcp.revoked"
                              : "mcp.active",
                        )}
                      </span>
                      <span className="task-due">
                        {token.lastUsedAt
                          ? t("mcp.lastUsed", { date: when(token.lastUsedAt) })
                          : t("mcp.neverUsed")}
                      </span>
                    </div>
                    <h3>{token.name}</h3>
                    <p className="task-owner">
                      {agents.find((agent) => agent.id === token.memberId)
                        ?.name ?? t("unknownMember")}{" "}
                      · <code>{token.prefix}…</code> · {token.scopes.join(", ")}
                    </p>
                    {!token.revokedAt &&
                      (confirming === token.id ? (
                        <div className="radio-row">
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
                        <div>
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
                        </div>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="me-section" aria-labelledby="calls-heading">
            <h2 id="calls-heading">{t("mcp.callLog")}</h2>
            {calls.isPending ? (
              <p aria-live="polite">{t("loading")}</p>
            ) : calls.isError ? (
              <p className="alert" role="alert">
                {t(errorKey(calls.error))}
              </p>
            ) : calls.data.length === 0 ? (
              <p className="section-hint">{t("mcp.noCalls")}</p>
            ) : (
              <table className="call-log">
                <thead>
                  <tr>
                    <th>{t("mcp.when")}</th>
                    <th>{t("mcp.method")}</th>
                    <th>{t("mcp.tool")}</th>
                    <th>{t("mcp.status")}</th>
                    <th>{t("mcp.duration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.data.map((call) => (
                    <tr key={call.id}>
                      <td>{when(call.createdAt)}</td>
                      <td>
                        <code>{call.method}</code>
                      </td>
                      <td>
                        <code>{call.tool ?? "—"}</code>
                      </td>
                      <td>{t(`mcp.callStatus.${call.status}`)}</td>
                      <td>
                        {new Intl.NumberFormat(locale, {
                          style: "unit",
                          unit: "millisecond",
                        }).format(call.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
