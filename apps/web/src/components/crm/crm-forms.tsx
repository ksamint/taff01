"use client";
// New/edit company and contact sheets (prototype phone ~1107/~1112, desktop
// forms) and the archive confirm. SheetDialog traps and restores focus.
import type { Company, Contact } from "@taff/schemas/crm";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ContactFieldErrors,
  type ContactFields,
  validateContactFields,
} from "../../lib/crm-view";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SheetDialog } from "../ui/sheet-dialog";

export function CompanyForm({
  company,
  busy,
  onClose,
  onSubmit,
}: {
  company: Company | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (fields: { name: string; industry: string }) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(company?.name ?? "");
  const [industry, setIndustry] = useState(company?.industry ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <SheetDialog
      title={t(company ? "crm.companies.edit" : "crm.companies.new")}
      onClose={onClose}
      className="crm-form"
    >
      <form
        noValidate
        data-testid="company-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setInvalid(true);
            return;
          }
          onSubmit({ name: name.trim(), industry: industry.trim() });
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-name`}>{t("crm.companies.name")}</Label>
          <Input
            id={`${id}-name`}
            data-testid="company-form-name"
            value={name}
            maxLength={200}
            required
            autoComplete="organization"
            aria-invalid={invalid && !name.trim()}
            aria-describedby={invalid ? `${id}-name-error` : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {invalid && !name.trim() && (
            <p id={`${id}-name-error`} className="field-error" role="alert">
              {t("crm.form.required")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-industry`}>
            {t("crm.companies.industry")}
          </Label>
          <Input
            id={`${id}-industry`}
            data-testid="company-form-industry"
            value={industry}
            maxLength={100}
            onChange={(event) => setIndustry(event.target.value)}
          />
        </div>
        <div className="action-row">
          <Button
            type="submit"
            className="button-primary"
            data-testid="company-form-save"
            disabled={busy}
          >
            {t(company ? "crm.form.save" : "crm.form.create")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}

export function ContactForm({
  contact,
  companies,
  initialCompanyId,
  busy,
  onClose,
  onSubmit,
}: {
  contact: Contact | null;
  companies: Company[];
  initialCompanyId?: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (fields: ContactFields, companyId: string | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [fields, setFields] = useState<ContactFields>({
    name: contact?.name ?? "",
    title: contact?.title ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
  });
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  // Hidden details (null) cannot be edited, only kept.
  const hidden = {
    phone: contact !== null && contact.phone === null,
    email: contact !== null && contact.email === null,
  };
  const field = (
    key: keyof ContactFields,
    type: string,
    autoComplete: string,
    max: number,
  ) =>
    hidden[key as "phone" | "email"] ? null : (
      <div className="field">
        <Label htmlFor={`${id}-${key}`}>{t(`crm.contacts.${key}Label`)}</Label>
        <Input
          id={`${id}-${key}`}
          data-testid={`contact-form-${key}`}
          type={type}
          value={fields[key]}
          maxLength={max}
          autoComplete={autoComplete}
          required={key === "name"}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
          onChange={(event) =>
            setFields((current) => ({ ...current, [key]: event.target.value }))
          }
        />
        {errors[key] && (
          <p id={`${id}-${key}-error`} className="field-error" role="alert">
            {t(`crm.form.${errors[key]}`)}
          </p>
        )}
      </div>
    );
  return (
    <SheetDialog
      title={t(contact ? "crm.contacts.edit" : "crm.contacts.new")}
      onClose={onClose}
      className="crm-form"
    >
      <form
        noValidate
        data-testid="contact-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = validateContactFields(fields);
          setErrors(next);
          if (Object.keys(next).length) return;
          onSubmit(
            {
              name: fields.name.trim(),
              title: fields.title.trim(),
              phone: fields.phone.trim(),
              email: fields.email.trim(),
            },
            companyId || null,
          );
        }}
      >
        {field("name", "text", "name", 200)}
        {field("title", "text", "organization-title", 200)}
        {!contact && (
          <div className="field">
            <Label htmlFor={`${id}-company`}>{t("crm.contacts.company")}</Label>
            <select
              id={`${id}-company`}
              data-testid="contact-form-company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">{t("crm.contacts.noCompany")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {field("phone", "tel", "tel", 50)}
        {field("email", "email", "email", 320)}
        <div className="action-row">
          <Button
            type="submit"
            className="button-primary"
            data-testid="contact-form-save"
            disabled={busy}
          >
            {t(contact ? "crm.form.save" : "crm.form.create")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}

/** 刪除 archives (D4); the confirm says so and names the record. */
export function ArchiveConfirm({
  title,
  body,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SheetDialog title={title} onClose={onClose} className="crm-confirm">
      <p data-testid="crm-confirm-body">{body}</p>
      <div className="action-row">
        <Button
          type="button"
          data-testid="crm-confirm-cancel"
          onClick={onClose}
        >
          {t("crm.form.cancel")}
        </Button>
        <Button
          type="button"
          className="button-primary crm-confirm-ok"
          data-testid="crm-confirm-ok"
          disabled={busy}
          onClick={onConfirm}
        >
          {t("crm.form.delete")}
        </Button>
      </div>
    </SheetDialog>
  );
}
