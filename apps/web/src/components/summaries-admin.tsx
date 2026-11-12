"use client";
import {
  type AudienceRecipient,
  type AudienceTag,
  audienceRecipientInputSchema,
  audienceRecipientUpdateSchema,
  audienceTagInputSchema,
  audienceTagUpdateSchema,
  type Locale,
  type SummaryPreview,
} from "@taff/schemas";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useContacts } from "../lib/crm-queries";
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
  const [editing, setEditing] = useState<AudienceTag | null>(null);
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
                    data-testid="audience-tag-edit"
                    disabled={update.isPending}
                    onClick={() => setEditing(tag)}
                  >
                    {t("audience.editTag")}
                  </Button>
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
          {editing && (
            <SheetDialog
              title={t("audience.editTag")}
              onClose={() => setEditing(null)}
            >
              <TagForm
                workspaceId={workspace.id}
                tag={editing}
                onClose={() => setEditing(null)}
              />
            </SheetDialog>
          )}
        </>
      )}
    </div>
  );
}

function TagForm({
  workspaceId,
  tag,
  onClose,
}: {
  workspaceId: string;
  tag?: AudienceTag;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAudienceTag(workspaceId);
  const update = useUpdateAudienceTag(workspaceId);
  const save = tag ? update : create;
  const prefix = tag ? "audience-tag-edit" : "audience-tag";
  const [org, setOrg] = useState(tag?.org ?? "");
  const [label, setLabel] = useState(tag?.label ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="summary-inline-form"
      data-testid={tag ? "audience-tag-form" : "audience-tag-new"}
      onSubmit={(event) => {
        event.preventDefault();
        const body = { org, label };
        const parsed = tag
          ? audienceTagUpdateSchema.safeParse({ ...body, version: tag.version })
          : audienceTagInputSchema.safeParse(body);
        setInvalid(!parsed.success);
        if (parsed.success) {
          if (tag)
            update.mutate(
              { ...body, id: tag.id, version: tag.version },
              { onSuccess: onClose },
            );
          else
            create.mutate(body, {
              onSuccess: () => {
                setOrg("");
                setLabel("");
              },
            });
        }
      }}
    >
      <div className="field">
        <Label htmlFor={`${prefix}-org`}>{t("audience.org")}</Label>
        <Input
          id={`${prefix}-org`}
          data-testid="audience-tag-org"
          value={org}
          maxLength={100}
          onChange={(event) => setOrg(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-label`}>{t("audience.label")}</Label>
        <Input
          id={`${prefix}-label`}
          data-testid="audience-tag-label"
          value={label}
          maxLength={100}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        className="button-primary"
        data-testid={tag ? "audience-tag-save" : "audience-tag-create"}
        disabled={save.isPending || !org.trim()}
      >
        {t(
          save.isPending
            ? "working"
            : tag
              ? "crm.form.save"
              : "audience.createTag",
        )}
      </Button>
      {onClose && (
        <Button type="button" onClick={onClose}>
          {t("crm.form.cancel")}
        </Button>
      )}
      {(invalid || save.error) && (
        <p className="alert" role="alert">
          {t(invalid ? "errors.invalid_input" : errorKey(save.error))}
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
  const [editing, setEditing] = useState<AudienceRecipient | null>(null);
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
                data-testid="audience-recipient-edit"
                disabled={update.isPending}
                onClick={() => setEditing(row)}
              >
                {t("audience.editRecipient")}
              </Button>
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
      {editing && (
        <SheetDialog
          title={t("audience.editRecipient")}
          onClose={() => setEditing(null)}
        >
          <RecipientForm
            tagId={tag.id}
            recipient={editing}
            onClose={() => setEditing(null)}
          />
        </SheetDialog>
      )}
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

function RecipientForm({
  tagId,
  recipient,
  onClose,
}: {
  tagId: string;
  recipient?: AudienceRecipient;
  onClose?: () => void;
}) {
  const { me, workspace } = useWorkspace();
  const { t } = useTranslation();
  const create = useCreateAudienceRecipient(workspace.id, tagId);
  const update = useUpdateAudienceRecipient(tagId);
  const save = recipient ? update : create;
  const prefix = recipient ? "audience-recipient-edit" : "audience-recipient";
  const members = useMembers(workspace.id);
  const contacts = useContacts(workspace.id);
  const people = (members.data ?? []).filter(
    (member) => member.kind === "person" && member.userId,
  );
  const [name, setName] = useState(recipient?.name ?? "");
  const [userId, setUserId] = useState(recipient?.userId ?? "");
  const [contactId, setContactId] = useState(recipient?.contactId ?? "");
  const [locale, setLocale] = useState<Locale>(
    recipient?.locale ?? me.user.locale,
  );
  const [timeZone, setTimeZone] = useState(recipient?.timeZone ?? me.user.tz);
  const [deliverAt, setDeliverAt] = useState(recipient?.deliverAt ?? "18:00");
  const [includeFinance, setIncludeFinance] = useState(
    recipient?.includeFinance ?? false,
  );
  const [showPeople, setShowPeople] = useState(recipient?.showPeople ?? true);
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="summary-inline-form"
      data-testid={
        recipient ? "audience-recipient-form" : "audience-recipient-new"
      }
      onSubmit={(event) => {
        event.preventDefault();
        const body = {
          name,
          ...(!recipient || userId !== (recipient.userId ?? "")
            ? { userId: userId || null }
            : {}),
          contactId: contactId || null,
          locale,
          timeZone,
          deliverAt,
          includeFinance,
          showPeople,
        };
        const parsed = recipient
          ? audienceRecipientUpdateSchema.safeParse({
              ...body,
              version: recipient.version,
            })
          : audienceRecipientInputSchema.safeParse(body);
        setInvalid(!parsed.success);
        if (parsed.success) {
          if (recipient)
            update.mutate(
              { ...body, id: recipient.id, version: recipient.version },
              { onSuccess: onClose },
            );
          else
            create.mutate(body, {
              onSuccess: () => {
                setName("");
                setUserId("");
                setContactId("");
              },
            });
        }
      }}
    >
      <div className="field">
        <Label htmlFor={`${prefix}-name`}>{t("audience.recipientName")}</Label>
        <Input
          id={`${prefix}-name`}
          data-testid={`${prefix}-name`}
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-account`}>{t("audience.account")}</Label>
        <select
          id={`${prefix}-account`}
          data-testid={`${prefix}-account`}
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            const member = people.find((p) => p.userId === event.target.value);
            if (member && !name.trim()) setName(member.name);
          }}
        >
          <option value="">{t("audience.linkOnly")}</option>
          {userId && !people.some((person) => person.userId === userId) && (
            <option value={userId}>{userId}</option>
          )}
          {people.map((member) => (
            <option key={member.id} value={member.userId ?? ""}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-contact`}>{t("search.contact")}</Label>
        <select
          id={`${prefix}-contact`}
          data-testid="audience-recipient-contact"
          value={contactId}
          disabled={contacts.isPending || !!contacts.error}
          onChange={(event) => setContactId(event.target.value)}
        >
          <option value="">{t("audience.noContact")}</option>
          {contactId &&
            !contacts.data?.some((contact) => contact.id === contactId) && (
              <option value={contactId}>
                {t("audience.unavailableContact")}
              </option>
            )}
          {contacts.data?.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
        {contacts.error && (
          <p className="alert" role="alert">
            {t(errorKey(contacts.error))}
          </p>
        )}
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-locale`}>{t("audience.locale")}</Label>
        <select
          id={`${prefix}-locale`}
          data-testid={`${prefix}-locale`}
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
        <Label htmlFor={`${prefix}-zone`}>{t("audience.timeZone")}</Label>
        <Input
          id={`${prefix}-zone`}
          data-testid={`${prefix}-zone`}
          value={timeZone}
          maxLength={64}
          onChange={(event) => setTimeZone(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-time`}>{t("audience.deliverAt")}</Label>
        <Input
          id={`${prefix}-time`}
          data-testid={`${prefix}-time`}
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
        data-testid={
          recipient ? "audience-recipient-save" : "audience-recipient-create"
        }
        disabled={save.isPending || !name.trim()}
      >
        {t(
          save.isPending
            ? "working"
            : recipient
              ? "crm.form.save"
              : "audience.createRecipient",
        )}
      </Button>
      {onClose && (
        <Button type="button" onClick={onClose}>
          {t("crm.form.cancel")}
        </Button>
      )}
      {(invalid || save.error) && (
        <p className="alert" role="alert">
          {t(invalid ? "errors.invalid_input" : errorKey(save.error))}
        </p>
      )}
    </form>
  );
}
