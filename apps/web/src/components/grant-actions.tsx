"use client";

import type { Grant } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useAlwaysAllowGrant, useDecideGrant } from "../lib/mutations/agents";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

export function GrantActions({
  grant,
  canDecide,
  canAlwaysAllow = false,
}: {
  grant: Grant;
  canDecide: boolean;
  /** 始終允許 also needs permission to manage the agent. */
  canAlwaysAllow?: boolean;
}) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(24);
  const { me } = useWorkspace();
  const actorId = me.workspaces.find(
    (workspace) => workspace.id === grant.workspaceId,
  )?.memberId;
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const decide = useDecideGrant(grant, actorId);
  const always = useAlwaysAllowGrant(grant, actorId);
  if (!canDecide) return null;
  return (
    <div>
      {grant.status === "pending" && (
        <>
          <div className="field">
            <Label htmlFor={`grant-expiry-${grant.id}`}>
              {t("grants.expiry")}
            </Label>
            <select
              id={`grant-expiry-${grant.id}`}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            >
              <option value={1}>{t("grants.oneHour")}</option>
              <option value={24}>{t("grants.oneDay")}</option>
              <option value={168}>{t("grants.oneWeek")}</option>
              <option value={720}>{t("grants.thirtyDays")}</option>
            </select>
          </div>
          <div className="action-row">
            <Button
              data-testid="grant-allow"
              className="button-primary"
              disabled={busy || grant.id.startsWith("optimistic:")}
              onClick={() =>
                decide.mutate({
                  decision: "allow",
                  expiresAt: new Date(
                    Date.now() + hours * 3_600_000,
                  ).toISOString(),
                })
              }
            >
              {t("grants.allow")}
            </Button>
            <Button
              data-testid="grant-deny"
              disabled={busy || grant.id.startsWith("optimistic:")}
              onClick={() => decide.mutate({ decision: "deny" })}
            >
              {t("grants.deny")}
            </Button>
          </div>
          {canAlwaysAllow && (
            <Button
              data-testid="grant-always"
              className="grant-always"
              disabled={busy || grant.id.startsWith("optimistic:")}
              onClick={() => always.mutate()}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              {t("grants.always")}
            </Button>
          )}
        </>
      )}
      {grant.status === "allowed" && (
        <Button
          data-testid="grant-revoke"
          disabled={busy || grant.id.startsWith("optimistic:")}
          onClick={() => decide.mutate({ decision: "revoke" })}
        >
          {t("grants.revoke")}
        </Button>
      )}
      {(decide.isError || always.isError) && (
        <p className="alert" role="alert">
          {t(errorKey(decide.error ?? always.error))}
        </p>
      )}
    </div>
  );
}
