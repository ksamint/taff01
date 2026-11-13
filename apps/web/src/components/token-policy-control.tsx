"use client";
import {
  type AgentToken,
  workspaceAdministrationListSchema,
} from "@taff/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { agentTokensKey } from "../lib/mutations/mcp";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";
import { Switch } from "./ui/switch";

/** Shared by the token card and system access matrix. */
export function TokenPolicyControl({
  token,
  disabled = false,
}: {
  token: AgentToken;
  disabled?: boolean;
}) {
  const { me, confirmed } = useWorkspace();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const organizations = useQuery({
    queryKey: ["admin-workspaces"],
    enabled: me.user.systemAdmin === true && confirm,
    queryFn: async () =>
      workspaceAdministrationListSchema.parse(
        await request("/api/admin/workspaces"),
      ),
  });
  const eligible = organizations.data?.filter(
    (item) => !item.personalOwnerId && !item.archivedAt,
  );
  async function save() {
    if (!confirmed || busy || disabled || !organizations.isSuccess) return;
    setBusy(true);
    try {
      await request(`/api/agent-tokens/${token.id}/organization-policy`, {
        method: "PUT",
        body: JSON.stringify({
          version: token.version,
          policy:
            token.organizationPolicy === "explicit"
              ? "all_organizations"
              : "explicit",
        }),
      });
      await Promise.all([
        client.invalidateQueries({
          queryKey: agentTokensKey(token.workspaceId),
        }),
        client.invalidateQueries({ queryKey: ["token-workspaces"] }),
        client.invalidateQueries({ queryKey: ["access-matrix"] }),
        client.invalidateQueries({ queryKey: ["system-access-matrix"] }),
      ]);
      setConfirm(false);
    } catch (error) {
      showToast(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }
  if (!me.user.systemAdmin) return null;
  return (
    <>
      <Label className="mcp-row">
        {t("mcp.policy.allOrganizations")}
        <Switch
          data-testid="token-policy-switch"
          checked={token.organizationPolicy === "all_organizations"}
          disabled={!confirmed || busy || disabled || !!token.revokedAt}
          onChange={() => setConfirm(true)}
        />
      </Label>
      {confirm && (
        <SheetDialog
          title={t("mcp.policy.confirmTitle")}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            {t(
              token.organizationPolicy === "explicit"
                ? "mcp.policy.enrollHint"
                : "mcp.policy.explicitHint",
              { count: eligible?.length ?? 0 },
            )}
          </p>
          {organizations.isPending && <p>{t("loading")}</p>}
          {organizations.error && (
            <p role="alert">{t(errorKey(organizations.error))}</p>
          )}
          <ul>
            {eligible?.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
          <div className="mcp-actions mcp-confirm-actions">
            <Button disabled={busy} onClick={() => setConfirm(false)}>
              {t("mcp.cancel")}
            </Button>
            <Button
              data-testid="grant-confirm"
              disabled={
                busy || disabled || !confirmed || !organizations.isSuccess
              }
              onClick={() => void save()}
            >
              {t("mcp.policy.confirm")}
            </Button>
          </div>
        </SheetDialog>
      )}
    </>
  );
}
