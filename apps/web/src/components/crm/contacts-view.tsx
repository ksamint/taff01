"use client";
import "../../styles/crm.css";
// Contacts (M15): phone list (prototype v2 320–331) and pushed contact page
// (837–864); desktop split list and detail (1318–1358).
import type { ContactScope } from "@taff/schemas/crm";
import { useIsMutating } from "@tanstack/react-query";
import { ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../../lib/api";
import { useCompanies, useContact, useContacts } from "../../lib/crm-queries";
import {
  contactMatches,
  groupContactLinks,
  linkHref,
} from "../../lib/crm-view";
import { initials } from "../../lib/initials";
import { useProjects } from "../../lib/m5-queries";
import {
  crmMutationKey,
  useArchiveCrmRecord,
  useRemoveContactLink,
  useRestoreCrmRecord,
  useSaveContact,
  useSetContactCompany,
  useSetContactRoles,
} from "../../lib/mutations/crm";
import { useWorkspaceAccess } from "../../lib/queries";
import { useDesktop } from "../../lib/use-desktop";
import { useWorkspace } from "../app-shell";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { BackLink, ContactAvatar, ContactRoleRow } from "./contact-role-row";
import { ArchiveConfirm, ContactForm } from "./crm-forms";
import { CrmSections } from "./crm-sections";

const GROUP_LABEL: Record<ContactScope, string> = {
  company: "crm.roles.company",
  project: "crm.roles.project",
  task: "crm.roles.task",
};

export function ContactsView({
  contactId = null,
}: {
  contactId?: string | null;
}) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const desktop = useDesktop();
  const access = useWorkspaceAccess(workspace.id);
  if (access.isPending) return <p className="loading">{t("loading")}</p>;
  if (!access.data?.canReadCrm)
    return (
      <div className="crm-view">
        <p className="crm-empty" data-testid="crm-no-access">
          {t("crm.noAccess")}
        </p>
      </div>
    );
  if (!desktop)
    return (
      <div className="crm-view" data-testid="contacts-view">
        {contactId ? (
          <ContactDetailView key={contactId} id={contactId} />
        ) : (
          <ContactList selected={null} />
        )}
      </div>
    );
  return (
    <div className="crm-view is-split" data-testid="contacts-view">
      <div className="crm-pane">
        <ContactList selected={contactId} />
      </div>
      {contactId ? (
        <ContactDetailView key={contactId} id={contactId} />
      ) : (
        <p className="crm-empty">{t("crm.contacts.pick")}</p>
      )}
    </div>
  );
}

function ContactList({ selected }: { selected: string | null }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const searchId = useId();
  const access = useWorkspaceAccess(workspace.id).data;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const contacts = useContacts(workspace.id);
  const companies = useCompanies(workspace.id);
  const save = useSaveContact(workspace.id, !!access?.canArchiveCrm);
  const companyName = (id: string | null) =>
    (id && companies.data?.find((company) => company.id === id)?.name) || "";
  const visible = (contacts.data ?? []).filter((contact) =>
    contactMatches(contact, query, companyName(contact.companyId)),
  );
  return (
    <section aria-labelledby={`${searchId}-title`}>
      <header className="crm-header">
        <CrmSections active="contacts" />
        <div className="crm-title-row">
          <h1 id={`${searchId}-title`}>{t("crm.contacts.title")}</h1>
          {access?.canManageCrm && (
            <Button
              className="crm-icon-button"
              data-testid="contact-new"
              aria-label={t("crm.contacts.new")}
              title={t("crm.contacts.new")}
              onClick={() => setCreating(true)}
            >
              <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>
      <div className="crm-tools">
        <div className="crm-search">
          <Label htmlFor={searchId} className="sr-only">
            {t("crm.searchPlaceholder")}
          </Label>
          <Input
            id={searchId}
            type="search"
            data-testid="contact-search"
            placeholder={t("crm.searchPlaceholder")}
            value={query}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {contacts.error && (
        <p className="alert" role="alert">
          {t(errorKey(contacts.error))}
        </p>
      )}
      {contacts.isPending ? (
        <p className="loading">{t("loading")}</p>
      ) : !visible.length ? (
        <p className="crm-empty">
          {t(query ? "crm.noMatches" : "crm.contacts.empty")}
        </p>
      ) : (
        <ul className="crm-list">
          {visible.map((contact) => (
            <li key={contact.id}>
              <Link
                className="crm-list-row"
                href={`/contacts/${contact.id}`}
                prefetch={false}
                data-testid="contact-row"
                data-id={contact.id}
                aria-current={selected === contact.id ? "page" : undefined}
              >
                <ContactAvatar text={initials(contact.name)} />
                <span className="crm-list-copy">
                  <span className="crm-list-name">{contact.name}</span>
                  <span className="crm-list-sub">
                    {[contact.title, companyName(contact.companyId)]
                      .filter(Boolean)
                      .join(" · ") || t("crm.contacts.noCompany")}
                  </span>
                </span>
                <span className="crm-list-chevron" aria-hidden="true">
                  <ChevronRight size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <ContactForm
          contact={null}
          companies={companies.data ?? []}
          busy={save.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(fields, companyId) =>
            save.mutate({
              contact: null,
              fields,
              companyId,
              onSaved: (contact) => {
                setCreating(false);
                router.push(`/contacts/${contact.id}`);
              },
            })
          }
        />
      )}
    </section>
  );
}

function ContactDetailView({ id }: { id: string }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const baseId = useId();
  const access = useWorkspaceAccess(workspace.id).data;
  const canManage = !!access?.canManageCrm;
  const canArchive = !!access?.canArchiveCrm;
  const detail = useContact(id);
  const companies = useCompanies(workspace.id);
  const projects = useProjects(workspace.id);
  const busy = useIsMutating({ mutationKey: crmMutationKey }) > 0;
  const setRoles = useSetContactRoles();
  const remove = useRemoveContactLink();
  const setCompany = useSetContactCompany();
  const save = useSaveContact(workspace.id, canArchive);
  const archive = useArchiveCrmRecord("contact");
  const restore = useRestoreCrmRecord("contact");
  const [editing, setEditing] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"edit" | "archive" | null>(null);
  if (detail.isPending) return <p className="loading">{t("loading")}</p>;
  if (!detail.data)
    return (
      <section className="crm-detail">
        <BackLink href="/contacts" />
        <p className="alert" role="alert">
          {t(errorKey(detail.error))}
        </p>
      </section>
    );
  const { contact, company, links } = detail.data;
  const projectName = (projectId: string | null) =>
    projects.data?.find((project) => project.id === projectId)?.name ?? "";
  const options = [
    ...(companies.data ?? []),
    ...(company && !companies.data?.some((item) => item.id === company.id)
      ? [company]
      : []),
  ];
  const editable = canManage && !contact.archivedAt;
  return (
    <section
      className="crm-detail"
      data-testid="contact-detail"
      aria-labelledby={`${baseId}-heading`}
    >
      <div className="crm-detail-top">
        <BackLink href="/contacts" />
        <span className="crm-detail-actions">
          {editable && (
            <Button
              className="crm-icon-button"
              data-testid="contact-edit"
              aria-label={t("crm.contacts.edit")}
              title={t("crm.contacts.edit")}
              onClick={() => setDialog("edit")}
            >
              <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
          {canArchive && contact.archivedAt && (
            <Button
              className="crm-icon-button"
              data-testid="contact-restore"
              aria-label={t("crm.restore")}
              title={t("crm.restore")}
              disabled={busy}
              onClick={() => restore.mutate({ record: contact })}
            >
              <RotateCcw size={18} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
        </span>
      </div>
      <div className="crm-detail-title">
        <ContactAvatar text={initials(contact.name)} />
        <div className="crm-detail-heading">
          <h1 id={`${baseId}-heading`} data-testid="contact-heading">
            {contact.name}
          </h1>
          {(contact.title || contact.archivedAt) && (
            <p>
              {[contact.title, contact.archivedAt ? t("crm.archived") : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      <dl className="crm-fields">
        <div className="crm-field">
          {editable ? (
            <>
              <dt>
                <label htmlFor={`${baseId}-company`}>
                  {t("crm.contacts.company")}
                </label>
              </dt>
              <dd>
                <select
                  id={`${baseId}-company`}
                  data-testid="contact-company-select"
                  value={contact.companyId ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value || null;
                    setCompany.mutate({
                      contact,
                      companyId: next,
                      companyName:
                        options.find((item) => item.id === next)?.name ?? null,
                      dropped: links
                        .filter(
                          (link) =>
                            link.scope === "company" &&
                            link.entityId === contact.companyId,
                        )
                        .map((link) => ({
                          entityId: link.entityId,
                          roles: link.roles,
                        })),
                    });
                  }}
                >
                  <option value="">{t("crm.contacts.noCompany")}</option>
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </dd>
            </>
          ) : (
            <>
              <dt>{t("crm.contacts.company")}</dt>
              <dd data-testid="contact-company">
                {company ? (
                  <Link href={`/companies/${company.id}`} prefetch={false}>
                    {company.name}
                  </Link>
                ) : (
                  t("crm.contacts.noCompany")
                )}
              </dd>
            </>
          )}
        </div>
        <div className="crm-field">
          <dt>{t("crm.contacts.phoneLabel")}</dt>
          <dd data-testid="contact-phone">
            {contact.phone ? (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                {contact.phone}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="crm-field">
          <dt>{t("crm.contacts.emailLabel")}</dt>
          <dd data-testid="contact-email">
            {contact.email ? (
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {groupContactLinks(links).map((group) => (
        <div className="crm-section" key={group.scope}>
          <div className="crm-section-heading">
            <h2 id={`${baseId}-${group.scope}`}>
              {t(GROUP_LABEL[group.scope])}
              <span className="crm-count">{group.links.length}</span>
            </h2>
          </div>
          <ul
            className="contact-rows"
            aria-labelledby={`${baseId}-${group.scope}`}
          >
            {group.links.map((link) => {
              const key = `${link.scope}:${link.entityId}`;
              const target = {
                scope: link.scope,
                entityId: link.entityId,
                projectId: link.projectId,
              };
              return (
                <ContactRoleRow
                  key={key}
                  testIdPrefix="contact-link"
                  dataId={link.entityId}
                  chipsId={`${baseId}-${link.scope}-${link.entityId}`}
                  scope={link.scope}
                  title={link.title}
                  sub={
                    link.scope === "task"
                      ? projectName(link.projectId)
                      : undefined
                  }
                  href={linkHref(link)}
                  roles={link.roles}
                  canManage={editable}
                  busy={busy}
                  open={editing === key}
                  onToggle={() => setEditing(editing === key ? null : key)}
                  onChange={(roles) =>
                    setRoles.mutate({
                      target,
                      contact,
                      roles,
                      projectName: projectName(link.projectId),
                    })
                  }
                  onRemove={() => {
                    setEditing(null);
                    remove.mutate({ target, contact });
                  }}
                  removeLabel={
                    link.scope === "project"
                      ? t("crm.removeFromProject")
                      : link.scope === "company"
                        ? t("crm.clearCompanyRoles")
                        : undefined
                  }
                />
              );
            })}
          </ul>
        </div>
      ))}
      {!links.length && <p className="crm-note">{t("crm.noLinks")}</p>}
      {canArchive && !contact.archivedAt && (
        <div className="crm-footer">
          <Button
            className="crm-danger"
            data-testid="contact-archive"
            onClick={() => setDialog("archive")}
          >
            <Trash2 size={16} aria-hidden="true" />
            {t("crm.contacts.delete")}
          </Button>
        </div>
      )}
      {dialog === "edit" && (
        <ContactForm
          contact={contact}
          companies={options}
          busy={save.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(fields) =>
            save.mutate({
              contact,
              fields: {
                ...fields,
                // Hidden details are not sent, so they stay unchanged.
                ...(contact.phone === null ? { phone: undefined } : {}),
                ...(contact.email === null ? { email: undefined } : {}),
              } as typeof fields,
              onSaved: () => setDialog(null),
            })
          }
        />
      )}
      {dialog === "archive" && (
        <ArchiveConfirm
          title={t("crm.contacts.delete")}
          body={t("crm.contacts.deleteConfirm", { name: contact.name })}
          busy={archive.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            archive.mutate({
              record: contact,
              onArchived: () => {
                setDialog(null);
                router.push("/contacts");
              },
            })
          }
        />
      )}
    </section>
  );
}
