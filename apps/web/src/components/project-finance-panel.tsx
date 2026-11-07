"use client";
import "../styles/project-finance.css";
import {
  moneySchema,
  type Payment,
  type Project,
  paymentListSchema,
  paymentSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useCompanies } from "../lib/crm-queries";
import { useManageProject } from "../lib/mutations/projects";
import { useWorkspaceAccess } from "../lib/queries";
import { timelineKey } from "../lib/timeline-queries";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

/** Common codes first; any stored ISO 4217 code is kept in the list. */
const CURRENCIES = [
  "HKD",
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "SGD",
  "TWD",
  "MOP",
  "AUD",
  "CAD",
];

const paymentsKey = (projectId: string) => ["payments", projectId] as const;

/** Cents from a decimal string, so totals never use floating point. */
const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
};

/**
 * Project finance for every person who may read it (ADR 0021), with the
 * admin-only controls the back end already enforces: contract amount,
 * currency and client company on the versioned project, and append-only
 * payments. The cumulative collected amount is the sum of payments.
 */
export function ProjectFinancePanel({ project }: { project: Project }) {
  const { workspace, me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const access = useWorkspaceAccess(workspace.id).data;
  const canRead = !!access?.canReadFinance;
  const canManage = !!access?.canManageFinance;
  const client = useQueryClient();
  const payments = useQuery({
    queryKey: paymentsKey(project.id),
    enabled: canRead,
    queryFn: async () =>
      paymentListSchema.parse(
        await request(`/api/projects/${project.id}/payments`),
      ),
  });
  const companies = useCompanies(workspace.id, canManage);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  if (!canRead) return null;

  const currency = project.currency;
  const money = (amount: string) =>
    currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(
          Number(amount),
        )
      : new Intl.NumberFormat(locale).format(Number(amount));
  const day = (civil: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${civil}T00:00:00Z`));
  const list = [...(payments.data ?? [])].reverse();
  const collected = (payments.data ?? []).reduce(
    (sum, payment) => sum + cents(payment.amount),
    0n,
  );
  const contract = project.contractAmount ? cents(project.contractAmount) : 0n;
  const percent = contract > 0n ? Number((collected * 100n) / contract) : null;
  const company = project.clientCompanyId
    ? companies.data?.find((item) => item.id === project.clientCompanyId)
    : undefined;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: paymentsKey(project.id) });
    void client.invalidateQueries({ queryKey: timelineKey(project.id) });
  };

  return (
    <section
      className="project-finance"
      data-testid="project-finance"
      aria-labelledby={`project-finance-${project.id}`}
    >
      <div className="project-finance-head">
        <h2 id={`project-finance-${project.id}`}>
          {t("projectFinance.title")}
        </h2>
        {canManage && (
          <div className="project-finance-actions">
            <Button
              type="button"
              data-testid="project-finance-edit"
              onClick={() => setEditing(true)}
            >
              {t("projectFinance.edit")}
            </Button>
            <Button
              type="button"
              className="button-primary"
              data-testid="project-finance-record"
              disabled={!currency}
              title={
                currency ? undefined : t("projectFinance.currencyRequired")
              }
              onClick={() => setRecording(true)}
            >
              {t("projectFinance.recordPayment")}
            </Button>
          </div>
        )}
      </div>
      <dl className="project-finance-facts">
        <div>
          <dt>{t("projectFinance.contract")}</dt>
          <dd data-testid="project-finance-contract">
            {project.contractAmount
              ? money(project.contractAmount)
              : t("projectFinance.noContract")}
          </dd>
        </div>
        <div>
          <dt>{t("projectFinance.collected")}</dt>
          <dd data-testid="project-finance-collected">
            {money(
              `${collected / 100n}.${String(collected % 100n).padStart(2, "0")}`,
            )}
            {percent !== null &&
              ` · ${new Intl.NumberFormat(locale, { style: "percent" }).format(percent / 100)}`}
          </dd>
        </div>
        {canManage && (
          <div>
            <dt>{t("projectFinance.client")}</dt>
            <dd>{company?.name ?? t("projectFinance.noClient")}</dd>
          </div>
        )}
      </dl>
      {!canManage && (
        <p className="project-finance-note">{t("projectFinance.readOnly")}</p>
      )}
      <h3>{t("projectFinance.payments")}</h3>
      {payments.error && <p role="alert">{t(errorKey(payments.error))}</p>}
      {payments.data && list.length === 0 && (
        <p className="project-finance-note">{t("projectFinance.noPayments")}</p>
      )}
      {list.length > 0 && (
        <ul className="project-finance-payments">
          {list.map((payment) => (
            <li key={payment.id} data-testid="project-payment">
              <span>{day(payment.paidOn)}</span>
              <strong>{money(payment.amount)}</strong>
              {payment.note && <span>{payment.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <FinanceDialog
          project={project}
          collected={collected}
          companies={(companies.data ?? []).map(({ id, name }) => ({
            id,
            name,
          }))}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
            showToast(t("projectFinance.saved"));
          }}
        />
      )}
      {recording && currency && (
        <PaymentDialog
          projectId={project.id}
          timeZone={me.user.tz}
          onClose={() => setRecording(false)}
          onSaved={(payment) => {
            setRecording(false);
            client.setQueryData<Payment[]>(
              paymentsKey(project.id),
              (current = []) => [...current, payment],
            );
            refresh();
            void client.invalidateQueries({ queryKey: ["projects"] });
            showToast(t("projectFinance.recorded"));
          }}
        />
      )}
    </section>
  );
}

function FinanceDialog({
  project,
  collected,
  companies,
  onClose,
  onSaved,
}: {
  project: Project;
  collected: bigint;
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const [contract, setContract] = useState(project.contractAmount ?? "");
  const [currency, setCurrency] = useState(project.currency ?? "");
  const [clientId, setClientId] = useState(project.clientCompanyId ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useManageProject(workspace.id, {
    mode: "edit",
    baseline: project,
    onSaved,
  });
  const locked = collected > 0n && !!project.currency;
  const codes = [
    ...new Set([
      ...(project.currency ? [project.currency] : []),
      ...CURRENCIES,
    ]),
  ];
  const names = new Intl.DisplayNames(locale, { type: "currency" });
  return (
    <SheetDialog title={t("projectFinance.edit")} onClose={onClose}>
      <form
        className="project-finance-form"
        data-testid="project-finance-form"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = contract.trim();
          if (amount && !moneySchema.safeParse(amount).success)
            return setProblem(t("projectFinance.invalidAmount"));
          if (amount && !currency)
            return setProblem(t("projectFinance.currencyRequired"));
          setProblem(null);
          save.mutate({
            version: project.version,
            contractAmount: amount || null,
            ...(locked ? {} : { currency: currency || null }),
            clientCompanyId: clientId || null,
          });
        }}
      >
        <div className="field">
          <Label htmlFor="project-finance-contract-input">
            {t("projectFinance.contract")}
          </Label>
          <Input
            id="project-finance-contract-input"
            data-testid="project-finance-contract-input"
            inputMode="decimal"
            autoComplete="off"
            value={contract}
            onChange={(event) => setContract(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="project-finance-currency">
            {t("projectFinance.currency")}
          </Label>
          <select
            id="project-finance-currency"
            data-testid="project-finance-currency"
            value={currency}
            disabled={locked}
            aria-describedby={locked ? "project-finance-locked" : undefined}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="">—</option>
            {codes.map((code) => (
              <option key={code} value={code}>
                {code} · {names.of(code)}
              </option>
            ))}
          </select>
          {locked && (
            <p id="project-finance-locked" className="project-finance-note">
              {t("projectFinance.currencyLocked")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor="project-finance-client">
            {t("projectFinance.client")}
          </Label>
          <select
            id="project-finance-client"
            data-testid="project-finance-client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="">{t("projectFinance.noClient")}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        {(problem || save.error) && (
          <p role="alert" data-testid="project-finance-error">
            {problem ?? t(errorKey(save.error))}
          </p>
        )}
        <div className="project-finance-buttons">
          <Button type="button" onClick={onClose}>
            {t("projectFinance.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            data-testid="project-finance-save"
            disabled={save.isPending}
          >
            {t(save.isPending ? "working" : "projectFinance.save")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}

function PaymentDialog({
  projectId,
  timeZone,
  onClose,
  onSaved,
}: {
  projectId: string;
  timeZone: string;
  onClose: () => void;
  onSaved: (payment: Payment) => void;
}) {
  const { t } = useTranslation();
  // en-CA formats a civil date as YYYY-MM-DD in the reader's own zone.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: async (body: {
      amount: string;
      paidOn: string;
      note?: string;
    }) =>
      paymentSchema.parse(
        await request(`/api/projects/${projectId}/payments`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: onSaved,
  });
  return (
    <SheetDialog title={t("projectFinance.recordPayment")} onClose={onClose}>
      <form
        className="project-finance-form"
        data-testid="project-payment-form"
        onSubmit={(event) => {
          event.preventDefault();
          const value = amount.trim();
          if (!moneySchema.safeParse(value).success)
            return setProblem(t("projectFinance.invalidAmount"));
          if (cents(value) <= 0n)
            return setProblem(t("projectFinance.positiveAmount"));
          setProblem(null);
          record.mutate({
            amount: value,
            paidOn,
            ...(note.trim() ? { note: note.trim() } : {}),
          });
        }}
      >
        <div className="field">
          <Label htmlFor="project-payment-amount">
            {t("projectFinance.amount")}
          </Label>
          <Input
            id="project-payment-amount"
            data-testid="project-payment-amount"
            inputMode="decimal"
            autoComplete="off"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="project-payment-date">
            {t("projectFinance.paidOn")}
          </Label>
          <Input
            id="project-payment-date"
            data-testid="project-payment-date"
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="project-payment-note">
            {t("projectFinance.note")}
          </Label>
          <Input
            id="project-payment-note"
            data-testid="project-payment-note"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <p className="project-finance-note">{t("projectFinance.appendOnly")}</p>
        {(problem || record.error) && (
          <p role="alert" data-testid="project-payment-error">
            {problem ?? t(errorKey(record.error))}
          </p>
        )}
        <div className="project-finance-buttons">
          <Button type="button" onClick={onClose}>
            {t("projectFinance.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            data-testid="project-payment-save"
            disabled={record.isPending}
          >
            {t(record.isPending ? "working" : "projectFinance.recordPayment")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
