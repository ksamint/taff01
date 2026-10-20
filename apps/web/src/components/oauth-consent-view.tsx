"use client";
import "../styles/mcp.css";
// OAuth 2.1 consent for MCP clients (ADR 0022). A person who manages agent
// tokens chooses the organization, agent and scopes a client acts with.
import {
  type OAuthAuthorize,
  oauthAuthorizeSchema,
  oauthConsentSchema,
  oauthRedirectSchema,
  type Scope,
  scopeSchema,
} from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../lib/api";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function OAuthConsentView() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const baseId = useId();
  const parsed = oauthAuthorizeSchema.safeParse(
    Object.fromEntries(params.entries()),
  );
  const query = parsed.success
    ? new URLSearchParams(
        Object.entries(parsed.data).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ).toString()
    : "";
  const consent = useQuery({
    queryKey: ["oauth-consent", query],
    enabled: parsed.success,
    retry: false,
    queryFn: () =>
      request(`/api/oauth/consent?${query}`).then(oauthConsentSchema.parse),
  });
  const [workspaceId, setWorkspaceId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  useEffect(() => {
    if (!consent.data) return;
    const first =
      consent.data.workspaces.find((item) => item.agents.length) ??
      consent.data.workspaces[0];
    setWorkspaceId(first?.id ?? "");
    setMemberId(first?.agents[0]?.id ?? "");
    setScopes(
      consent.data.scopes.filter((scope) =>
        first?.allowedScopes.includes(scope),
      ),
    );
  }, [consent.data]);

  if (!parsed.success || consent.error)
    return (
      <Shell title={t("oauth.invalidTitle")}>
        <p className="alert" role="alert" data-testid="oauth-invalid">
          {consent.error instanceof ApiError && consent.error.status >= 500
            ? t(errorKey(consent.error))
            : t("oauth.invalid")}
        </p>
      </Shell>
    );
  if (!consent.data)
    return (
      <Shell title={t("oauth.title")}>
        <p className="loading">{t("loading")}</p>
      </Shell>
    );
  const { client } = consent.data;
  const workspace = consent.data.workspaces.find(
    (item) => item.id === workspaceId,
  );
  const decide = async (decision: "approve" | "deny") => {
    setPending(true);
    setFailure(null);
    try {
      const { redirectTo } = await request(`/api/oauth/consent`, {
        method: "POST",
        body: JSON.stringify({
          request: parsed.data satisfies OAuthAuthorize,
          decision,
          ...(decision === "approve" ? { workspaceId, memberId, scopes } : {}),
        }),
      }).then(oauthRedirectSchema.parse);
      window.location.assign(redirectTo);
    } catch (error) {
      setFailure(error);
      setPending(false);
    }
  };
  return (
    <Shell title={t("oauth.title")}>
      <p className="mcp-lede" data-testid="oauth-client">
        {t("oauth.subtitle", { client: client.name })}
      </p>
      <p className="mcp-note" data-testid="oauth-redirect">
        {t("oauth.redirectNote", { host: client.redirectHost })}
      </p>
      {!consent.data.workspaces.length ? (
        <p className="alert" role="alert" data-testid="oauth-no-workspace">
          {t("oauth.noSupervisedAgent")}
        </p>
      ) : (
        <form
          className="mcp-form"
          onSubmit={(event) => {
            event.preventDefault();
            void decide("approve");
          }}
        >
          <div className="field">
            <Label htmlFor={`${baseId}-workspace`}>
              {t("oauth.organization")}
            </Label>
            <select
              id={`${baseId}-workspace`}
              data-testid="oauth-workspace"
              value={workspaceId}
              onChange={(event) => {
                const next = consent.data.workspaces.find(
                  (item) => item.id === event.target.value,
                );
                setWorkspaceId(event.target.value);
                setMemberId(next?.agents[0]?.id ?? "");
                setScopes(
                  consent.data.scopes.filter((scope) =>
                    next?.allowedScopes.includes(scope),
                  ),
                );
              }}
            >
              {consent.data.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {workspace?.agents.length ? (
            <div className="field">
              <Label htmlFor={`${baseId}-agent`}>{t("oauth.agent")}</Label>
              <select
                id={`${baseId}-agent`}
                data-testid="oauth-agent"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
              >
                {workspace.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <p className="mcp-note">{t("oauth.agentHint")}</p>
            </div>
          ) : (
            <p className="alert" role="alert" data-testid="oauth-no-agent">
              {t("oauth.noAgent")}
            </p>
          )}
          <fieldset className="mcp-scopes">
            <legend className="mcp-label">{t("mcp.scopes")}</legend>
            {scopeSchema.options.map((scope) => (
              <label key={scope} className="mcp-scope">
                <span className="mcp-row-copy">
                  <span className="mcp-row-title">
                    {t(`mcp.scope.${scope}`, { nsSeparator: false })}
                  </span>
                  <code className="mcp-row-sub mcp-mono">{scope}</code>
                  {!workspace?.allowedScopes.includes(scope) && (
                    <span
                      className="mcp-row-sub"
                      data-testid={`oauth-scope-locked-${scope}`}
                    >
                      {t("oauth.adminOnlyScope")}
                    </span>
                  )}
                </span>
                <Switch
                  data-testid={`oauth-scope-${scope}`}
                  checked={scopes.includes(scope)}
                  disabled={!workspace?.allowedScopes.includes(scope)}
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
          {failure !== null && (
            <p className="alert" role="alert">
              {t(errorKey(failure))}
            </p>
          )}
          <div className="mcp-actions">
            <Button
              type="submit"
              className="button-primary"
              data-testid="oauth-approve"
              disabled={pending || !memberId || !scopes.length}
            >
              {t("oauth.approve")}
            </Button>
            <Button
              type="button"
              data-testid="oauth-deny"
              disabled={pending}
              onClick={() => void decide("deny")}
            >
              {t("oauth.deny")}
            </Button>
          </div>
        </form>
      )}
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mcp-view" data-testid="oauth-consent">
      <div className="mcp-page">
        <div className="mcp-intro">
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
