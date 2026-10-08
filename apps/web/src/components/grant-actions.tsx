"use client";

import { type DecideGrant, decideGrantSchema, type Grant } from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
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
  const decide = useMutation({
    mutationFn: (body: DecideGrant) =>
      request(`/api/grants/${grant.id}/decision`, {
        method: "POST",
        body: JSON.stringify(decideGrantSchema.parse(body)),
      }),
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
              disabled={decide.isPending}
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
              disabled={decide.isPending}
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
          disabled={decide.isPending}
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
