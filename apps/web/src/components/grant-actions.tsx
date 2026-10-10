"use client";

import {
  type AgentProfile,
  type DecideGrant,
  decideGrantSchema,
  type Grant,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { agentKey, invalidateM3 } from "../lib/m3-queries";
import { m3MutationKey, resolveInbox, snapshotM3 } from "../lib/optimistic-m3";
import { restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

export function GrantActions({
  grant,
  canDecide,
}: {
  grant: Grant;
  canDecide: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [hours, setHours] = useState(24);
  const { me } = useWorkspace();
  const actorId = me.workspaces.find(
    (workspace) => workspace.id === grant.workspaceId,
  )?.memberId;
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const decide = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: DecideGrant) =>
      request(`/api/grants/${grant.id}/decision`, {
        method: "POST",
        body: JSON.stringify(decideGrantSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(grant.agentId), (current) =>
        current
          ? {
              ...current,
              grants: current.grants.map((item) =>
                item.id === grant.id
                  ? {
                      ...item,
                      status:
                        body.decision === "allow"
                          ? "allowed"
                          : body.decision === "deny"
                            ? "denied"
                            : "revoked",
                      expiresAt: body.expiresAt ?? item.expiresAt,
                      decidedBy: actorId ?? item.decidedBy,
                    }
                  : item,
              ),
            }
          : current,
      );
      resolveInbox(client, (item) => item.grantId === grant.id);
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
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
      {decide.isError && (
        <p className="alert" role="alert">
          {t(errorKey(decide.error))}
        </p>
      )}
    </div>
  );
}
