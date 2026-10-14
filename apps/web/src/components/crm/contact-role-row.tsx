"use client";
import "../../styles/crm.css";
// The one role row (plan M15) for company, project (相關方), task and
// contact-page links. Chips come from `rolesForScope(scope)`; labels from
// i18next. Test ids keep the M14 task names through `testIdPrefix`.
import {
  type ContactRole,
  type ContactScope,
  rolesForScope,
} from "@taff/schemas/crm";
import { ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

export function ContactRoleRow({
  testIdPrefix,
  scope,
  title,
  sub,
  badge,
  avatar,
  href,
  roles,
  linked = true,
  canManage,
  busy,
  open,
  onToggle,
  onChange,
  onRemove,
  removeLabel,
  dataId,
  chipsId,
}: {
  /** Test id prefix: the row, `-roles`, `-edit`, `-role-<role>`, `-remove`. */
  testIdPrefix: string;
  scope: ContactScope;
  title: string;
  sub?: string;
  badge?: string;
  avatar?: ReactNode;
  href: string;
  roles: ContactRole[];
  /** False for an employee without a company-role link yet. */
  linked?: boolean;
  canManage: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (roles: ContactRole[]) => void;
  onRemove?: () => void;
  removeLabel?: string;
  dataId: string;
  chipsId: string;
}) {
  const { t } = useTranslation();
  const label = roles.length
    ? roles.map((role) => t(`crm.role.${role}`)).join(t("crm.roleSeparator"))
    : t("crm.noRole");
  return (
    <li className="contact-row" data-testid={testIdPrefix} data-id={dataId}>
      <div className="contact-row-line">
        <Link className="contact-row-main" href={href} prefetch={false}>
          {avatar}
          <span className="contact-row-copy">
            <span className="contact-row-name">
              <span>{title}</span>
              {badge && <span className="contact-row-badge">{badge}</span>}
            </span>
            {!!sub && <span className="contact-row-sub">{sub}</span>}
            <span
              className={`contact-row-roles${roles.length ? "" : " is-empty"}`}
              data-testid={`${testIdPrefix}-roles`}
            >
              {label}
            </span>
          </span>
        </Link>
        {canManage && (
          <Button
            type="button"
            className="contact-row-edit"
            data-testid={`${testIdPrefix}-edit`}
            aria-expanded={open}
            aria-controls={open ? chipsId : undefined}
            aria-label={t(open ? "crm.doneEditingFor" : "crm.editRolesFor", {
              name: title,
            })}
            onClick={onToggle}
          >
            {t(open ? "actions.done" : "crm.rolesTitle")}
          </Button>
        )}
      </div>
      {open && canManage && (
        <div
          id={chipsId}
          className="contact-row-chips"
          role="group"
          aria-label={t(`crm.roles.${scope}`)}
        >
          {rolesForScope(scope).map((role) => {
            const on = roles.includes(role);
            return (
              <Button
                type="button"
                key={role}
                className="role-chip"
                data-testid={`${testIdPrefix}-role-${role}`}
                aria-pressed={on}
                disabled={busy}
                onClick={() =>
                  onChange(
                    on
                      ? roles.filter((item) => item !== role)
                      : [...roles, role],
                  )
                }
              >
                {t(`crm.role.${role}`)}
              </Button>
            );
          })}
          {onRemove && linked && (
            <Button
              type="button"
              className="contact-row-remove"
              data-testid={`${testIdPrefix}-remove`}
              disabled={busy}
              onClick={onRemove}
            >
              {removeLabel ?? t("actions.remove")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Round initials for a person, as in the prototype rows. */
export function ContactAvatar({ text }: { text: string }) {
  return (
    <span className="contact-avatar" aria-hidden="true">
      {text}
    </span>
  );
}

/** The square company mark of the prototype rows. */
export function CompanyMark() {
  return (
    <span className="crm-company-mark" aria-hidden="true">
      <Building2 size={18} strokeWidth={1.5} />
    </span>
  );
}

/** The phone back arrow of a pushed CRM page (hidden in the desktop split). */
export function BackLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Link
      className="crm-back"
      href={href}
      prefetch={false}
      aria-label={t("actions.back")}
      title={t("actions.back")}
      data-testid="crm-back"
    >
      <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}
