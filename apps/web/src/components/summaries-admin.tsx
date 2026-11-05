"use client";
import {
  type AudienceRecipient,
  type AudienceTag,
  audienceRecipientInputSchema,
  audienceTagInputSchema,
  type Locale,
  type SummaryPreview,
} from "@taff/schemas";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { locales } from "../lib/i18n";
import { useMembers } from "../lib/queries";
import {
  useAudienceRecipients,
  useAudienceTags,
  useCreateAudienceRecipient,
  useCreateAudienceTag,
  useDailySummaries,
  useSummaryPreview,
  useUpdateAudienceRecipient,
  useUpdateAudienceTag,
} from "../lib/summary-queries";
import { useWorkspace } from "./app-shell";
import { summaryDay } from "./summaries-view";
import { SummaryDocument, type Translate } from "./summary-document";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

/**
 * /orgs/summaries (ADR 0027): admins tag shareholder organizations, add
 * recipients, preview today's summary and open sent summaries to share them.
 * Every rule is enforced by the API; this page only hides what would 403.
 */
export function SummariesAdmin() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const admin = workspace.role === "admin";
  const tags = useAudienceTags(workspace.id, admin);
  const update = useUpdateAudienceTag(workspace.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    tags.data?.find((tag) => tag.id === selectedId) ??
    tags.data?.find((tag) => !tag.archived) ??
    null;
  const chip = (tag: AudienceTag) =>
    t("audience.chip", { kind: t(`audience.kind.${tag.kind}`), org: tag.org });
  return (
    <div
      className="summaries-admin summaries-page"
      data-testid="summaries-admin"
    >
      <Link className="text-link" href="/orgs">
        <ArrowLeft size={16} aria-hidden="true" /> {t("mcp.back")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("audience.adminTitle")}</h1>
        <p className="task-count">{t("audience.adminHint")}</p>
      </section>
      {!admin ? (
        <p role="status">{t("audience.adminOnly")}</p>
      ) : (
        <>
          <section>
            <h2>{t("audience.tags")}</h2>
            <TagForm workspaceId={workspace.id} />
            {tags.isPending && <p aria-live="polite">{t("loading")}</p>}
            {(tags.error ?? update.error) && (
              <p className="alert" role="alert">
                {t(errorKey(tags.error ?? update.error))}
              </p>
            )}
            {tags.data?.length === 0 && (
              <p className="summary-quiet">{t("audience.noTags")}</p>
            )}
            <ul className="summary-rows">
              {tags.data?.map((tag) => (
                <li
                  key={tag.id}
                  className="summary-row"
                  data-testid="audience-tag-row"
                  data-tag={tag.id}
                  aria-current={tag.id === selected?.id}
                >
                  <Button
                    className="button-quiet"
                    data-testid="audience-tag-open"
                    onClick={() => setSelectedId(tag.id)}
                  >
                    <strong>{chip(tag)}</strong>
                  </Button>
                  {tag.label && <span>{tag.label}</span>}
                  <span className="summary-quiet">
                    {t("audience.counts", {
                      projects: tag.projectCount,
                      recipients: tag.recipientCount,
                    })}
                  </span>
                  {tag.archived && (
                    <span className="summary-chip">
                      {t("audience.archived")}
                    </span>
                  )}
                  <Button
                    className="button-quiet"
                    data-testid="audience-tag-archive"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: tag.id,
                        version: tag.version,
                        archived: !tag.archived,
                      })
                    }
                  >
                    {t(tag.archived ? "audience.restore" : "audience.archive")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          {selected && <TagPanel key={selected.id} tag={selected} />}
        </>
      )}
    </div>
  );
}

function TagForm({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const create = useCreateAudienceTag(workspaceId);
  const [org, setOrg] = useState("");
  const [label, setLabel] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="summary-inline-form"
      data-testid="audience-tag-new"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = audienceTagInputSchema.safeParse({
          org,
          ...(label.trim() ? { label } : {}),
        });
        setInvalid(!parsed.success);
        if (parsed.success)
          create.mutate(parsed.data, {
            onSuccess: () => {
              setOrg("");
              setLabel("");
            },
          });
      }}
    >
      <div className="field">
        <Label htmlFor="audience-tag-org">{t("audience.org")}</Label>
        <Input
          id="audience-tag-org"
          data-testid="audience-tag-org"
          value={org}
          maxLength={100}
          onChange={(event) => setOrg(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor="audience-tag-label">{t("audience.label")}</Label>
        <Input
          id="audience-tag-label"
          data-testid="audience-tag-label"
          value={label}
          maxLength={100}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        className="button-primary"
        data-testid="audience-tag-create"
        disabled={create.isPending || !org.trim()}
      >
        {t(create.isPending ? "working" : "audience.createTag")}
      </Button>
      {(invalid || create.error) && (
        <p className="alert" role="alert">
          {t(invalid ? "errors.invalid_input" : errorKey(create.error))}
        </p>
      )}
    </form>
  );
}

function TagPanel({ tag }: { tag: AudienceTag }) {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const recipients = useAudienceRecipients(tag.id);
  const update = useUpdateAudienceRecipient(tag.id);
  const summaries = useDailySummaries(workspace.id, { tagId: tag.id });
  const preview = useSummaryPreview();
  const [shown, setShown] = useState<SummaryPreview | null>(null);
  const members = useMembers(workspace.id);
  const accountName = (userId: string | null) =>
    userId
      ? (members.data?.find((member) => member.userId === userId)?.name ??
        userId)
      : t("audience.linkOnly");
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me.user.tz,
    }).format(new Date(iso));
  const toggle = (
    row: AudienceRecipient,
    patch: Partial<
      Pick<AudienceRecipient, "enabled" | "includeFinance" | "showPeople">
    >,
  ) => update.mutate({ id: row.id, version: row.version, ...patch });
  const error = recipients.error ?? update.error ?? preview.error;
  return (
    <>
      <section data-testid="audience-tag-panel">
        <h2>
          {t("audience.recipients")} ·{" "}
          {t("audience.chip", {
            kind: t(`audience.kind.${tag.kind}`),
            org: tag.org,
          })}
        </h2>
        {!tag.archived && <RecipientForm tagId={tag.id} />}
        {error && (
          <p className="alert" role="alert">
            {t(errorKey(error))}
          </p>
        )}
        {recipients.data?.length === 0 && (
          <p className="summary-quiet">{t("audience.noRecipients")}</p>
        )}
        <ul className="summary-rows">
          {recipients.data?.map((row) => (
            <li
              key={row.id}
              className="summary-row"
              data-testid="audience-recipient-row"
              data-recipient={row.id}
              data-enabled={row.enabled}
            >
              <strong>{row.name}</strong>
              <span>{accountName(row.userId)}</span>
              <span>
                {t(row.locale)} · {row.timeZone} · {row.deliverAt}
              </span>
              <span className="summary-chip">
                {t(row.enabled ? "audience.sending" : "audience.paused")}
              </span>
              {row.enabled && (
                <span className="summary-quiet">
                  {t("audience.nextDue", { date: when(row.nextDueAt) })}
                </span>
              )}
              <label className="summary-check">
                <input
                  type="checkbox"
                  data-testid="audience-recipient-finance"
                  checked={row.includeFinance}
                  onChange={(event) =>
                    toggle(row, { includeFinance: event.target.checked })
                  }
                />
                {t("audience.includeFinance")}
              </label>
              <label className="summary-check">
                <input
                  type="checkbox"
                  data-testid="audience-recipient-people"
                  checked={row.showPeople}
                  onChange={(event) =>
                    toggle(row, { showPeople: event.target.checked })
                  }
                />
                {t("audience.showPeople")}
              </label>
              <Button
                className="button-quiet"
                data-testid="audience-recipient-toggle"
                onClick={() => toggle(row, { enabled: !row.enabled })}
              >
                {t(row.enabled ? "audience.pause" : "audience.resume")}
              </Button>
              <Button
                data-testid="summary-preview-open"
                disabled={preview.isPending}
                onClick={() =>
                  preview.mutate(row.id, {
                    onSuccess: (value) => setShown(value),
                  })
                }
              >
                {t(preview.isPending ? "working" : "audience.preview")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{t("audience.summaries")}</h2>
        {summaries.data?.items.length === 0 && (
          <p className="summary-quiet">{t("audience.noSummaries")}</p>
        )}
        <ul className="summary-rows" data-testid="summary-list">
          {summaries.data?.items.map((summary) => (
            <li key={summary.id} className="summary-row">
              <Link
                className="text-link"
                href={`/summaries/${summary.id}`}
                data-testid="summary-row"
                data-summary={summary.id}
              >
                {summaryDay(summary, locale)}
              </Link>
              <span>{summary.snapshot.recipient.name}</span>
            </li>
          ))}
        </ul>
      </section>
      {shown && (
        <SheetDialog
          title={t("audience.preview")}
          onClose={() => setShown(null)}
        >
          <div data-testid="summary-preview">
            <SummaryDocument
              snapshot={shown.snapshot}
              watermark={shown.watermark}
              contentHash={shown.contentHash}
              createdAt={null}
              locale={locale}
              t={t as Translate}
            />
            <Button onClick={() => setShown(null)}>
              {t("audience.closePreview")}
            </Button>
          </div>
        </SheetDialog>
      )}
    </>
  );
}

function RecipientForm({ tagId }: { tagId: string }) {
  const { me, workspace } = useWorkspace();
  const { t } = useTranslation();
  const create = useCreateAudienceRecipient(workspace.id, tagId);
  const members = useMembers(workspace.id);
  const people = (members.data ?? []).filter(
    (member) => member.kind === "person" && member.userId,
  );
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [locale, setLocale] = useState<Locale>(me.user.locale);
  const [timeZone, setTimeZone] = useState(me.user.tz);
  const [deliverAt, setDeliverAt] = useState("18:00");
  const [includeFinance, setIncludeFinance] = useState(false);
  const [showPeople, setShowPeople] = useState(true);
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="summary-inline-form"
      data-testid="audience-recipient-new"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = audienceRecipientInputSchema.safeParse({
          name,
          userId: userId || null,
          locale,
          timeZone,
          deliverAt,
          includeFinance,
          showPeople,
        });
        setInvalid(!parsed.success);
        if (parsed.success)
          create.mutate(parsed.data, {
            onSuccess: () => {
              setName("");
              setUserId("");
            },
          });
      }}
    >
      <div className="field">
        <Label htmlFor="audience-recipient-name">
          {t("audience.recipientName")}
        </Label>
        <Input
          id="audience-recipient-name"
          data-testid="audience-recipient-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor="audience-recipient-account">
          {t("audience.account")}
        </Label>
        <select
          id="audience-recipient-account"
          data-testid="audience-recipient-account"
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            const member = people.find((p) => p.userId === event.target.value);
            if (member && !name.trim()) setName(member.name);
          }}
        >
          <option value="">{t("audience.linkOnly")}</option>
          {people.map((member) => (
            <option key={member.id} value={member.userId ?? ""}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor="audience-recipient-locale">
          {t("audience.locale")}
        </Label>
        <select
          id="audience-recipient-locale"
          data-testid="audience-recipient-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          {locales.map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor="audience-recipient-zone">
          {t("audience.timeZone")}
        </Label>
        <Input
          id="audience-recipient-zone"
          data-testid="audience-recipient-zone"
          value={timeZone}
          maxLength={64}
          onChange={(event) => setTimeZone(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor="audience-recipient-time">
          {t("audience.deliverAt")}
        </Label>
        <Input
          id="audience-recipient-time"
          data-testid="audience-recipient-time"
          type="time"
          step={60}
          value={deliverAt}
          onChange={(event) => setDeliverAt(event.target.value)}
        />
      </div>
      <label className="summary-check">
        <input
          type="checkbox"
          checked={includeFinance}
          onChange={(event) => setIncludeFinance(event.target.checked)}
        />
        {t("audience.includeFinance")}
      </label>
      <label className="summary-check">
        <input
          type="checkbox"
          checked={showPeople}
          onChange={(event) => setShowPeople(event.target.checked)}
        />
        {t("audience.showPeople")}
      </label>
      <Button
        type="submit"
        className="button-primary"
        data-testid="audience-recipient-create"
        disabled={create.isPending || !name.trim()}
      >
        {t(create.isPending ? "working" : "audience.createRecipient")}
      </Button>
      {(invalid || create.error) && (
        <p className="alert" role="alert">
          {t(invalid ? "errors.invalid_input" : errorKey(create.error))}
        </p>
      )}
    </form>
  );
}
