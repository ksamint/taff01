"use client";

import { type MemberRate, memberRateSchema } from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { decimalToMicros } from "../lib/money-micros";
import { useMembers } from "../lib/queries";
import { memberRatesFamily, useMemberRates } from "../lib/time-queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

export function formatHourlyRate(rate: MemberRate, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: rate.currency,
    maximumFractionDigits: 6,
  }).format(rate.rateMicrosPerHour / 1_000_000);
}

export function MemberRateSheet({
  today,
  onClose,
}: {
  today: string;
  onClose: () => void;
}) {
  const { workspace, me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const id = useId();
  const members = useMembers(workspace.id);
  const rates = useMemberRates(workspace.id, true);
  const people = (members.data ?? []).filter(
    (member) => member.kind === "person",
  );
  const [personId, setPersonId] = useState(workspace.memberId);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const rateMicrosPerHour = decimalToMicros(amount);
  const input = memberRateSchema.safeParse({
    workspaceId: workspace.id,
    personId,
    rateMicrosPerHour,
    currency,
    validFrom,
  });
  const current = rates.data?.find(
    (rate) => rate.personId === personId && rate.validFrom <= today,
  );
  const save = useMutation({
    mutationFn: async (value: MemberRate) =>
      memberRateSchema.parse(
        await request("/api/member-rates", {
          method: "POST",
          body: JSON.stringify(value),
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: memberRatesFamily });
      onClose();
    },
  });
  const error = save.error ?? members.error ?? rates.error;
  const canSave =
    input.success &&
    members.isSuccess &&
    people.some((person) => person.id === personId);
  return (
    <SheetDialog title={t("timeTracking.setRate")} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave && !save.isPending) save.mutate(input.data);
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-person`}>{t("timeTracking.person")}</Label>
          <select
            id={`${id}-person`}
            disabled={!members.isSuccess}
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          {current && rates.isSuccess && (
            <p className="section-hint">
              {t("timeTracking.currentRate", {
                rate: formatHourlyRate(
                  current,
                  i18n.resolvedLanguage ?? me.user.locale,
                ),
              })}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-amount`}>{t("timeTracking.amount")}</Label>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            required
            onChange={(event) => setAmount(event.target.value)}
          />
          {amount && !Number.isSafeInteger(rateMicrosPerHour) && (
            <p className="alert" role="alert">
              {t("timeTracking.invalidRate")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-currency`}>{t("timeTracking.currency")}</Label>
          <Input
            id={`${id}-currency`}
            autoCapitalize="characters"
            maxLength={3}
            required
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
          {currency && !/^[A-Z]{3}$/.test(currency) && (
            <p className="alert" role="alert">
              {t("timeTracking.invalidCurrency")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-from`}>{t("timeTracking.validFrom")}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            required
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>
        {(members.isPending || rates.isPending) && (
          <p aria-live="polite">{t("loading")}</p>
        )}
        {error && (
          <p className="alert" role="alert">
            {t(errorKey(error))}
          </p>
        )}
        <div className="action-row">
          <Button type="button" onClick={onClose}>
            {t("planning.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            disabled={!canSave || save.isPending}
          >
            {t(save.isPending ? "working" : "planning.save")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
