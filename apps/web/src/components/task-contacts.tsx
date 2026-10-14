"use client";
import type { Task } from "@taff/schemas";
// Task 聯繫人 (prototype v2 phone 577–597, desktop 1600–1620), backed by the
// M12 contact links. Roles come from CONTACT_ROLE_RULES; labels from i18next.
import {
  type Contact,
  type ContactLink,
  type ContactRole,
  rolesForScope,
} from "@taff/schemas/crm";
import { useIsMutating } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useCompanies, useContactLinks, useContacts } from "../lib/crm-queries";
import { initials } from "../lib/initials";
import { useProjects, useWorkspaceAccess } from "../lib/m5-queries";
import {
  crmMutationKey,
  useRemoveTaskContact,
  useSetTaskContactRoles,
} from "../lib/mutations/crm";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const TASK_ROLES = rolesForScope("task");

export function TaskContacts({ task }: { task: Task }) {
  const { t } = useTranslation();
  const headingId = useId();
  const access = useWorkspaceAccess(task.workspaceId);
  const canRead = !!access.data?.canReadCrm;
  const canManage = !!access.data?.canManageCrm;
  const projects = useProjects(task.workspaceId);
  const project = projects.data?.find((item) => item.id === task.projectId);
  const links = useContactLinks(
    "task",
    canRead ? task.projectId && task.id : null,
  );
  const companies = useCompanies(task.workspaceId, canRead);
  const busy = useIsMutating({ mutationKey: crmMutationKey }) > 0;
  const setRoles = useSetTaskContactRoles(task, project?.name ?? "");
  const remove = useRemoveTaskContact(task);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  if (!canRead) return null;
  const join = (roles: ContactRole[]) =>
    roles.map((role) => t(`crm.role.${role}`)).join(t("crm.roleSeparator"));
  const companyName = (id: string | null) =>
    id ? companies.data?.find((company) => company.id === id)?.name : undefined;
  const sub = (contact: Contact) =>
    [contact.title, companyName(contact.companyId)].filter(Boolean).join(" · ");
  const rows = links.data ?? [];
  const error = setRoles.error ?? remove.error ?? links.error;
  return (
    <section
      className="task-section task-contacts"
      aria-labelledby={headingId}
      data-testid="task-contacts"
    >
      <div className="task-section-heading">
        <h2 id={headingId}>{t("crm.contacts.title")}</h2>
        {!!rows.length && (
          <span className="task-section-count">{rows.length}</span>
        )}
      </div>
      {!task.projectId ? (
        <p
          className="task-contacts-note"
          data-testid="task-contacts-no-project"
        >
          {t("crm.contacts.needsProject")}
        </p>
      ) : (
        <>
          <ul className="task-contacts-list">
            {rows.map((link) => {
              const open = editing === link.contactId;
              const chipsId = `${headingId}-${link.contactId}`;
              const external =
                !!project?.clientCompanyId &&
                link.contact.companyId !== project.clientCompanyId;
              return (
                <li
                  key={link.contactId}
                  className="task-contact"
                  data-testid="task-contact"
                  data-contact-id={link.contactId}
                >
                  <div className="task-contact-row">
                    <Link
                      className="task-contact-main"
                      href={`/contacts/${link.contactId}`}
                      prefetch={false}
                    >
                      <span className="task-contact-avatar" aria-hidden="true">
                        {initials(link.contact.name)}
                      </span>
                      <span className="task-contact-copy">
                        <span className="task-contact-name">
                          <span>{link.contact.name}</span>
                          {external && (
                            <span className="task-contact-external">
                              {t("crm.external")}
                            </span>
                          )}
                        </span>
                        {!!sub(link.contact) && (
                          <span className="task-contact-sub">
                            {sub(link.contact)}
                          </span>
                        )}
                        <span
                          className={`task-contact-roles${link.roles.length ? "" : " is-empty"}`}
                          data-testid="task-contact-roles"
                        >
                          {link.roles.length
                            ? join(link.roles)
                            : t("crm.noRole")}
                        </span>
                      </span>
                    </Link>
                    {canManage && (
                      <Button
                        type="button"
                        className="task-contact-edit"
                        data-testid="task-contact-edit"
                        aria-expanded={open}
                        aria-controls={open ? chipsId : undefined}
                        aria-label={t(
                          open ? "crm.doneEditingFor" : "crm.editRolesFor",
                          { name: link.contact.name },
                        )}
                        onClick={() => setEditing(open ? null : link.contactId)}
                      >
                        {t(open ? "actions.done" : "crm.rolesTitle")}
                      </Button>
                    )}
                  </div>
                  {open && canManage && (
                    <div
                      id={chipsId}
                      className="task-contact-chips"
                      role="group"
                      aria-label={t("crm.roles.task")}
                    >
                      {TASK_ROLES.map((role) => {
                        const on = link.roles.includes(role);
                        return (
                          <Button
                            type="button"
                            key={role}
                            className="role-chip"
                            data-testid={`task-contact-role-${role}`}
                            aria-pressed={on}
                            disabled={busy}
                            onClick={() =>
                              setRoles.mutate({
                                contact: link.contact,
                                roles: on
                                  ? link.roles.filter((item) => item !== role)
                                  : [...link.roles, role],
                              })
                            }
                          >
                            {t(`crm.role.${role}`)}
                          </Button>
                        );
                      })}
                      <Button
                        type="button"
                        className="task-contact-remove"
                        data-testid="task-contact-remove"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null);
                          remove.mutate({ contact: link.contact });
                        }}
                      >
                        {t("actions.remove")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {links.isSuccess && !rows.length && (
            <p className="task-contacts-note">{t("crm.contacts.noneOnTask")}</p>
          )}
          {canManage && (
            <Button
              type="button"
              className="task-contacts-add"
              data-testid="task-contact-add"
              disabled={busy || !links.isSuccess}
              onClick={() => setPicking(true)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("crm.contacts.add")}
            </Button>
          )}
        </>
      )}
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {picking && task.projectId && (
        <ContactPicker
          workspaceId={task.workspaceId}
          projectId={task.projectId}
          linked={rows}
          describe={sub}
          onClose={() => setPicking(false)}
          onPick={(contact, roles) => {
            setPicking(false);
            setRoles.mutate({ contact, roles });
          }}
        />
      )}
    </section>
  );
}

function ContactPicker({
  workspaceId,
  projectId,
  linked,
  describe,
  onClose,
  onPick,
}: {
  workspaceId: string;
  projectId: string;
  linked: ContactLink[];
  describe: (contact: Contact) => string;
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
  const text = query.trim().toLocaleLowerCase();
  const onTask = new Set(linked.map((link) => link.contactId));
  const onProject = new Set(
    (stakeholders.data ?? []).map((link) => link.contactId),
  );
  const available = (contacts.data ?? []).filter(
    (contact) =>
      !onTask.has(contact.id) &&
      (!text ||
        [contact.name, contact.title, describe(contact)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(text)),
  );
  const groups = [
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
  ].filter((group) => group.items.length);
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
          data-testid="task-contact-search"
          value={query}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {(contacts.isError || stakeholders.isError) && (
        <p className="alert" role="alert">
          {t(errorKey(contacts.error ?? stakeholders.error))}
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
                      data-testid="task-contact-option"
                      aria-pressed={chosen?.id === contact.id}
                      onClick={() => setChosen(contact)}
                    >
                      <span className="task-contact-avatar" aria-hidden="true">
                        {initials(contact.name)}
                      </span>
                      <span className="task-contact-copy">
                        <span className="task-contact-name">
                          <span>{contact.name}</span>
                        </span>
                        {!!describe(contact) && (
                          <span className="task-contact-sub">
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
          <div className="task-contact-chips">
            {TASK_ROLES.map((role) => {
              const on = roles.includes(role);
              return (
                <Button
                  type="button"
                  key={role}
                  className="role-chip"
                  data-testid={`task-contact-new-role-${role}`}
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
          data-testid="task-contact-confirm"
          disabled={!chosen}
          onClick={() => chosen && onPick(chosen, roles)}
        >
          {t("crm.contacts.addConfirm")}
        </Button>
      </div>
    </SheetDialog>
  );
}
