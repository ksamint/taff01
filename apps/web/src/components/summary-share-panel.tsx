"use client";
import type { SummaryShare } from "@taff/schemas";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import {
  useCreateSummaryShare,
  useRevokeSummaryShare,
  useSummaryShares,
} from "../lib/summary-queries";
import { showToast } from "../lib/toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const DAY_CHOICES = [1, 7, 30, 90];

/**
 * Admin-only share links for one summary (ADR 0027): create with an expiry,
 * copy the link once, see status and views, revoke with a confirm step.
 */
export function SummarySharePanel({
  summaryId,
  timeZone,
}: {
  summaryId: string;
  timeZone: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const shares = useSummaryShares(summaryId);
  const create = useCreateSummaryShare(summaryId);
  const revoke = useRevokeSummaryShare(summaryId);
  const [days, setDays] = useState(7);
  const [issued, setIssued] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
  const error = create.error ?? revoke.error ?? shares.error;
  const link = issued
    ? new URL(`/s/${issued}`, window.location.origin).toString()
    : null;
  const row = (share: SummaryShare) => (
    <li
      key={share.id}
      className="summary-share-row"
      data-testid="summary-share-row"
      data-status={share.status}
    >
      <span className="summary-chip">{t(`share.status.${share.status}`)}</span>
      <span>{t("share.expiresAt", { date: when(share.expiresAt) })}</span>
      <span>
        {t("share.views", {
          count: new Intl.NumberFormat(locale).format(share.viewCount),
        })}
      </span>
      {share.lastViewedAt && (
        <span>{t("share.lastViewed", { date: when(share.lastViewedAt) })}</span>
      )}
      {share.status === "active" &&
        (confirming === share.id ? (
          <span className="summary-confirm" role="group">
            <span>{t("share.revokeConfirm")}</span>
            <Button
              className="button-danger"
              data-testid="summary-share-revoke-confirm"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate(share.id, {
                  onSuccess: () => {
                    setConfirming(null);
                    showToast(t("share.revoked"));
                  },
                })
              }
            >
              {t("share.revoke")}
            </Button>
            <Button
              className="button-quiet"
              onClick={() => setConfirming(null)}
            >
              {t("mcp.cancel")}
            </Button>
          </span>
        ) : (
          <Button
            className="button-quiet"
            data-testid="summary-share-revoke"
            onClick={() => setConfirming(share.id)}
          >
            {t("share.revoke")}
          </Button>
        ))}
    </li>
  );
  return (
    <section
      className="summary-share-panel no-print"
      data-testid="summary-shares"
    >
      <h2>{t("share.title")}</h2>
      <form
        className="summary-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setIssued(null);
          create.mutate(days, { onSuccess: (share) => setIssued(share.token) });
        }}
      >
        <div className="field">
          <Label htmlFor="summary-share-days">{t("share.validFor")}</Label>
          <select
            id="summary-share-days"
            data-testid="summary-share-days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {DAY_CHOICES.map((value) => (
              <option key={value} value={value}>
                {new Intl.NumberFormat(locale).format(value)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          className="button-primary"
          data-testid="summary-share-new"
          disabled={create.isPending}
        >
          {t(create.isPending ? "working" : "share.create")}
        </Button>
      </form>
      {link && (
        <div className="summary-issued" role="status">
          <Label htmlFor="summary-share-link">{t("share.onceHint")}</Label>
          <Input
            id="summary-share-link"
            data-testid="summary-share-link"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            data-testid="summary-share-copy"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(link)
                .then(() => showToast(t("organization.copied")))
                .catch(() => undefined)
            }
          >
            {t("share.copy")}
          </Button>
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {shares.data?.length === 0 && (
        <p className="summary-quiet">{t("share.none")}</p>
      )}
      <ul className="summary-share-list">{shares.data?.map(row)}</ul>
    </section>
  );
}
