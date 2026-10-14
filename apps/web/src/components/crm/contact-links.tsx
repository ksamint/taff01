"use client";
// The contact list of a project (相關方) or task (聯繫人): one ContactRoleRow
// per link, the add-contact picker, and every write through the shared CRM
// mutations (toast with 撤銷 calling the inverse API).
import type {
  Company,
  Contact,
  ContactLink,
  ContactRole,
  ContactScope,
} from "@taff/schemas/crm";
import { rolesForScope } from "@taff/schemas/crm";
import { useIsMutating } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../../lib/api";
import { useContactLinks, useContacts } from "../../lib/crm-queries";
import { contactMatches, isExternal } from "../../lib/crm-view";
import { initials } from "../../lib/initials";
import {
  crmMutationKey,
  type LinkTarget,
  useRemoveContactLink,
  useSetContactRoles,
} from "../../lib/mutations/crm";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SheetDialog } from "../ui/sheet-dialog";
import { ContactAvatar, ContactRoleRow } from "./contact-role-row";

export function ContactLinks({
  workspaceId,
  target,
  testIdPrefix,
  links,
  companies,
  clientCompanyId,
  projectName,
  canManage,
  emptyText,
  removeLabel,
}: {
  workspaceId: string;
  target: LinkTarget;
  /** Test id prefix for rows and the picker (`task-contact`, `stakeholder`). */
  testIdPrefix: string;
  links: ContactLink[] | undefined;
  companies: Company[] | undefined;
  clientCompanyId: string | null | undefined;
  projectName: string;
  canManage: boolean;
  emptyText: string;
  removeLabel?: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const busy = useIsMutating({ mutationKey: crmMutationKey }) > 0;
  const setRoles = useSetContactRoles();
  const remove = useRemoveContactLink();
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const companyName = (id: string | null) =>
    id ? companies?.find((company) => company.id === id)?.name : undefined;
  const sub = (contact: Contact) =>
    [contact.title, companyName(contact.companyId)].filter(Boolean).join(" · ");
  const rows = links ?? [];
  const change = (contact: Contact, roles: ContactRole[]) =>
    setRoles.mutate({ target, contact, roles, projectName });
  const error = setRoles.error ?? remove.error;
  return (
    <>
      <ul className="contact-rows">
        {rows.map((link) => (
          <ContactRoleRow
            key={link.contactId}
            testIdPrefix={testIdPrefix}
            dataId={link.contactId}
            chipsId={`${baseId}-${link.contactId}`}
            scope={target.scope}
            title={link.contact.name}
            sub={sub(link.contact)}
            badge={
              isExternal(link.contact, clientCompanyId)
                ? t("crm.external")
                : undefined
            }
            avatar={<ContactAvatar text={initials(link.contact.name)} />}
            href={`/contacts/${link.contactId}`}
            roles={link.roles}
            canManage={canManage}
            busy={busy}
            open={editing === link.contactId}
            onToggle={() =>
              setEditing(editing === link.contactId ? null : link.contactId)
            }
            onChange={(roles) => change(link.contact, roles)}
            onRemove={() => {
              setEditing(null);
              remove.mutate({ target, contact: link.contact });
            }}
            removeLabel={removeLabel}
          />
        ))}
      </ul>
      {links && !rows.length && <p className="crm-note">{emptyText}</p>}
      {canManage && (
        <Button
          type="button"
          className="crm-add"
          data-testid={`${testIdPrefix}-add`}
          disabled={busy || !links}
          onClick={() => setPicking(true)}
        >
          <Plus size={16} aria-hidden="true" />
          {t("crm.contacts.add")}
        </Button>
      )}
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {picking && (
        <ContactPicker
          workspaceId={workspaceId}
          scope={target.scope}
          projectId={target.scope === "task" ? target.projectId : null}
          testIdPrefix={testIdPrefix}
          linked={rows}
          describe={sub}
          companyName={(contact) => companyName(contact.companyId) ?? ""}
          onClose={() => setPicking(false)}
          onPick={(contact, roles) => {
            setPicking(false);
            change(contact, roles);
          }}
        />
      )}
    </>
  );
}

/**
 * Pick a contact and its first roles. A task's picker lists the project's
 * stakeholders first (prototype 項目相關方 · 其他聯繫人).
 */
function ContactPicker({
  workspaceId,
  scope,
  projectId,
  testIdPrefix,
  linked,
  describe,
  companyName,
  onClose,
  onPick,
}: {
  workspaceId: string;
  scope: ContactScope;
  projectId: string | null;
  testIdPrefix: string;
  linked: ContactLink[];
  describe: (contact: Contact) => string;
  companyName: (contact: Contact) => string;
  onClose: () => void;
  onPick: (contact: Contact, roles: ContactRole[]) => void;
}) {
  const { t } = useTranslation();
  const searchId = useId();
  const contacts = useContacts(workspaceId);
  const stakeholders = useContactLinks("project", projectId);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Contact | null>(null);
  const [roles, setRoles] = useState<ContactRole[]>([]);
  const linkedIds = new Set(linked.map((link) => link.contactId));
  const onProject = new Set(
    (stakeholders.data ?? []).map((link) => link.contactId),
  );
  const available = (contacts.data ?? []).filter(
    (contact) =>
      !linkedIds.has(contact.id) &&
      contactMatches(contact, query, companyName(contact)),
  );
  const groups = (
    projectId
      ? [
          {
            key: "project",
            label: t("crm.stakeholders.fromProject"),
            items: available.filter((contact) => onProject.has(contact.id)),
          },
          {
            key: "others",
            label: t("crm.contacts.others"),
            items: available.filter((contact) => !onProject.has(contact.id)),
          },
        ]
      : [{ key: "all", label: t("crm.contacts.title"), items: available }]
  ).filter((group) => group.items.length);
  const error = contacts.error ?? stakeholders.error;
  return (
    <SheetDialog
      title={t("crm.contacts.add")}
      onClose={onClose}
      className="contact-picker"
    >
      <div className="field">
        <Label htmlFor={searchId}>{t("crm.contacts.search")}</Label>
        <Input
          id={searchId}
          data-testid={`${testIdPrefix}-search`}
          value={query}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {contacts.isPending ? (
        <p className="section-hint">{t("loading")}</p>
      ) : !groups.length ? (
        <p className="section-hint">{t("crm.contacts.noMatches")}</p>
      ) : (
        <div className="contact-picker-groups">
          {groups.map((group) => (
            <section
              key={group.key}
              className="contact-picker-group"
              aria-label={group.label}
            >
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((contact) => (
                  <li key={contact.id}>
                    <Button
                      type="button"
                      className="contact-picker-option"
                      data-testid={`${testIdPrefix}-option`}
                      aria-pressed={chosen?.id === contact.id}
                      onClick={() => setChosen(contact)}
                    >
                      <ContactAvatar text={initials(contact.name)} />
                      <span className="contact-row-copy">
                        <span className="contact-row-name">
                          <span>{contact.name}</span>
                        </span>
                        {!!describe(contact) && (
                          <span className="contact-row-sub">
                            {describe(contact)}
                          </span>
                        )}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {chosen && (
        <fieldset className="contact-picker-roles">
          <legend>{t("crm.rolesFor", { name: chosen.name })}</legend>
          <div className="contact-row-chips">
            {rolesForScope(scope).map((role) => {
              const on = roles.includes(role);
              return (
                <Button
                  type="button"
                  key={role}
                  className="role-chip"
                  data-testid={`${testIdPrefix}-new-role-${role}`}
                  aria-pressed={on}
                  onClick={() =>
                    setRoles((current) =>
                      on
                        ? current.filter((item) => item !== role)
                        : [...current, role],
                    )
                  }
                >
                  {t(`crm.role.${role}`)}
                </Button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="action-row">
        <Button
          type="button"
          className="button-primary"
          data-testid={`${testIdPrefix}-confirm`}
          disabled={!chosen}
          onClick={() => chosen && onPick(chosen, roles)}
        >
          {t("crm.contacts.addConfirm")}
        </Button>
      </div>
    </SheetDialog>
  );
}
