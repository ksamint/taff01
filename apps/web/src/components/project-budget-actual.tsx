"use client";

import {
  type ProjectBudget,
  projectActualSchema,
  projectBudgetSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import {
  decimalToMicros,
  formatMoneyMicros,
  microsToDecimal,
} from "../lib/money-micros";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const actualKey = (projectId: string) => ["project-actual", projectId] as const;

export function ProjectBudgetActual({
  projectId,
  projectCurrency,
  canManage,
}: {
  projectId: string;
  projectCurrency: string | null;
  canManage: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const heading = useId();
  const [editing, setEditing] = useState(false);
  const actual = useQuery({
    queryKey: actualKey(projectId),
    queryFn: async ({ signal }) =>
      projectActualSchema.parse(
        await request(`/api/costs/projects/${projectId}/actual`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
  return (
    <section className="project-budget-actual" aria-labelledby={heading}>
      <div className="project-finance-head">
        <h3 id={heading}>{t("projectFinance.budgetActual")}</h3>
        {canManage && actual.isSuccess && (
          <Button type="button" onClick={() => setEditing(true)}>
            {t("projectFinance.editBudget")}
          </Button>
        )}
      </div>
      {actual.isPending && (
        <p className="project-finance-note" aria-live="polite">
          {t("loading")}
        </p>
      )}
      {actual.error && (
        <div className="alert" role="alert">
          <p>{t(errorKey(actual.error))}</p>
          <Button type="button" onClick={() => void actual.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {actual.isSuccess && (
        <>
          <dl className="project-finance-facts">
            <div>
              <dt>{t("projectFinance.budget")}</dt>
              <dd>
                {actual.data.budget
                  ? formatMoneyMicros(
                      actual.data.budget.amountMicros,
                      actual.data.budget.currency,
                      locale,
                    )
                  : t("projectFinance.noBudget")}
              </dd>
            </div>
            {actual.data.byCurrency.length === 0 && (
              <div>
                <dt>{t("projectFinance.actual")}</dt>
                <dd>{t("projectFinance.noActual")}</dd>
              </div>
            )}
            {actual.data.byCurrency.map((row) => (
              <div key={row.currency}>
                <dt>
                  {t("projectFinance.actualInCurrency", {
                    currency: row.currency,
                  })}
                </dt>
                <dd>
                  {formatMoneyMicros(row.totalMicros, row.currency, locale)}
                </dd>
                <dd className="project-budget-detail">
                  {t("projectFinance.actualBreakdown", {
                    agent: formatMoneyMicros(
                      row.agentMicros,
                      row.currency,
                      locale,
                    ),
                    time: formatMoneyMicros(
                      row.timeMicros,
                      row.currency,
                      locale,
                    ),
                  })}
                </dd>
              </div>
            ))}
          </dl>
          {actual.data.unratedMinutes > 0 && (
            <p className="project-budget-warning" role="status">
              {t("projectFinance.unratedMinutes", {
                minutes: new Intl.NumberFormat(locale).format(
                  actual.data.unratedMinutes,
                ),
              })}
            </p>
          )}
          {editing && canManage && (
            <BudgetSheet
              projectId={projectId}
              budget={actual.data.budget}
              projectCurrency={projectCurrency}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      )}
    </section>
  );
}

function BudgetSheet({
  projectId,
  budget,
  projectCurrency,
  onClose,
}: {
  projectId: string;
  budget: ProjectBudget | null;
  projectCurrency: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const id = useId();
  const [amount, setAmount] = useState(
    budget ? microsToDecimal(budget.amountMicros) : "",
  );
  const [currency, setCurrency] = useState(
    budget?.currency ?? projectCurrency ?? "",
  );
  const amountMicros = decimalToMicros(amount);
  const input = projectBudgetSchema.safeParse({ amountMicros, currency });
  const save = useMutation({
    mutationFn: async (value: ProjectBudget) =>
      projectBudgetSchema.parse(
        await request(`/api/costs/projects/${projectId}/budget`, {
          method: "POST",
          body: JSON.stringify(value),
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: actualKey(projectId) });
      onClose();
    },
  });
  return (
    <SheetDialog title={t("projectFinance.editBudget")} onClose={onClose}>
      <form
        className="project-finance-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.success && !save.isPending) save.mutate(input.data);
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-amount`}>
            {t("projectFinance.budgetAmount")}
          </Label>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {amount && !Number.isSafeInteger(amountMicros) && (
            <p className="alert" role="alert">
              {t("projectFinance.invalidBudget")}
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
        {save.error && (
          <p className="alert" role="alert">
            {t(errorKey(save.error))}
          </p>
        )}
        <div className="project-finance-buttons">
          <Button type="button" onClick={onClose}>
            {t("projectFinance.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            disabled={!input.success || save.isPending}
          >
            {t(save.isPending ? "working" : "projectFinance.save")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
