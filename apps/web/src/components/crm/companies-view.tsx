"use client";
import "../../styles/crm.css";
// Companies (M15): phone list (prototype v2 308–318) and pushed company page
// (805–835); desktop split list and detail (1270–1317).
import type { Company, Contact } from "@taff/schemas/crm";
import { useIsMutating } from "@tanstack/react-query";
import {
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../../lib/api";
import {
  useCompany,
  useCompanyList,
  useContactLinks,
  useContacts,
} from "../../lib/crm-queries";
import { companyMatches } from "../../lib/crm-view";
import { initials } from "../../lib/initials";
import { useProjects } from "../../lib/m5-queries";
import {
  crmMutationKey,
  useArchiveCrmRecord,
  useRemoveContactLink,
  useRestoreCrmRecord,
  useSaveCompany,
  useSaveContact,
  useSetContactRoles,
} from "../../lib/mutations/crm";
import { useWorkspaceAccess } from "../../lib/queries";
import { useDesktop } from "../../lib/use-desktop";
import { useWorkspace } from "../app-shell";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  BackLink,
  CompanyMark,
  ContactAvatar,
  ContactRoleRow,
} from "./contact-role-row";
import { ArchiveConfirm, CompanyForm, ContactForm } from "./crm-forms";
import { CrmSections } from "./crm-sections";

export function CompaniesView({
  companyId = null,
}: {
  companyId?: string | null;
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
      <div className="crm-view" data-testid="companies-view">
        {companyId ? (
          <CompanyDetail key={companyId} id={companyId} />
        ) : (
          <CompanyList selected={null} />
        )}
      </div>
    );
  return (
    <div className="crm-view is-split" data-testid="companies-view">
      <div className="crm-pane">
        <CompanyList selected={companyId} />
      </div>
      {companyId ? (
        <CompanyDetail key={companyId} id={companyId} />
      ) : (
        <p className="crm-empty">{t("crm.companies.pick")}</p>
      )}
    </div>
  );
}

function CompanyList({ selected }: { selected: string | null }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const searchId = useId();
  const access = useWorkspaceAccess(workspace.id).data;
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const companies = useCompanyList(
    workspace.id,
    archived && !!access?.canArchiveCrm,
  );
  const contacts = useContacts(workspace.id);
  const projects = useProjects(workspace.id);
  const save = useSaveCompany(workspace.id, !!access?.canArchiveCrm);
  const visible = (companies.data ?? []).filter((company) =>
    companyMatches(company, query),
  );
  const people = (company: Company) =>
    (contacts.data ?? []).filter((contact) => contact.companyId === company.id)
      .length;
  const isClient = (company: Company) =>
    (projects.data ?? []).some(
      (project) => project.clientCompanyId === company.id && !project.archived,
    );
  return (
    <section aria-labelledby={`${searchId}-title`}>
      <header className="crm-header">
        <CrmSections active="companies" />
        <div className="crm-title-row">
          <h1 id={`${searchId}-title`}>{t("crm.companies.title")}</h1>
          {access?.canManageCrm && (
            <Button
              className="crm-icon-button"
              data-testid="company-new"
              aria-label={t("crm.companies.new")}
              title={t("crm.companies.new")}
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
            {t("crm.companies.search")}
          </Label>
          <Input
            id={searchId}
            type="search"
            data-testid="company-search"
            placeholder={t("crm.companies.search")}
            value={query}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {access?.canArchiveCrm && (
          <label className="crm-toggle">
            <input
              type="checkbox"
              data-testid="company-archived-toggle"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
            />
            {t("crm.showArchived")}
          </label>
        )}
      </div>
      {companies.error && (
        <p className="alert" role="alert">
          {t(errorKey(companies.error))}
        </p>
      )}
      {companies.isPending ? (
        <p className="loading">{t("loading")}</p>
      ) : !visible.length ? (
        <p className="crm-empty">
          {query ? (
            <>
              <Search size={14} aria-hidden="true" /> {t("crm.noMatches")}
            </>
          ) : (
            t("crm.companies.empty")
          )}
        </p>
      ) : (
        <ul className="crm-list">
          {visible.map((company) => (
            <li key={company.id}>
              <Link
                className={`crm-list-row${company.archivedAt ? " is-archived" : ""}`}
                href={`/companies/${company.id}`}
                prefetch={false}
                data-testid="company-row"
                data-id={company.id}
                aria-current={selected === company.id ? "page" : undefined}
              >
                <CompanyMark />
                <span className="crm-list-copy">
                  <span className="crm-list-title">
                    <span className="crm-list-name">{company.name}</span>
                    {isClient(company) && (
                      <span className="crm-badge is-client">
                        {t("crm.client")}
                      </span>
                    )}
                    {company.archivedAt && (
                      <span className="crm-badge">{t("crm.archived")}</span>
                    )}
                  </span>
                  <span className="crm-list-sub">
                    {[
                      company.industry,
                      t("crm.companies.people", { count: people(company) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
        <CompanyForm
          company={null}
          busy={save.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(fields) =>
            save.mutate({
              company: null,
              fields,
              onSaved: (company) => {
                setCreating(false);
                router.push(`/companies/${company.id}`);
              },
            })
          }
        />
      )}
    </section>
  );
}

function CompanyDetail({ id }: { id: string }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const baseId = useId();
  const access = useWorkspaceAccess(workspace.id).data;
  const canManage = !!access?.canManageCrm;
  const canArchive = !!access?.canArchiveCrm;
  const detail = useCompany(id);
  const links = useContactLinks("company", id);
  const busy = useIsMutating({ mutationKey: crmMutationKey }) > 0;
  const setRoles = useSetContactRoles();
  const remove = useRemoveContactLink();
  const save = useSaveCompany(workspace.id, canArchive);
  const saveContact = useSaveContact(workspace.id, canArchive);
  const archive = useArchiveCrmRecord("company");
  const restore = useRestoreCrmRecord("company");
  const [editing, setEditing] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"edit" | "archive" | "contact" | null>(
    null,
  );
  if (detail.isPending) return <p className="loading">{t("loading")}</p>;
  if (!detail.data)
    return (
      <section className="crm-detail">
        <BackLink href="/companies" />
        <p className="alert" role="alert">
          {t(errorKey(detail.error))}
        </p>
      </section>
    );
  const { company, contacts, projects } = detail.data;
  const roles = (contact: Contact) =>
    links.data?.find((link) => link.contactId === contact.id);
  const target = {
    scope: "company" as const,
    entityId: company.id,
    projectId: null,
  };
  return (
    <section
      className="crm-detail"
      data-testid="company-detail"
      aria-labelledby={`${baseId}-heading`}
    >
      <div className="crm-detail-top">
        <BackLink href="/companies" />
        <span className="crm-detail-actions">
          {canManage && !company.archivedAt && (
            <Button
              className="crm-icon-button"
              data-testid="company-edit"
              aria-label={t("crm.companies.edit")}
              title={t("crm.companies.edit")}
              onClick={() => setDialog("edit")}
            >
              <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
          {canArchive &&
            (company.archivedAt ? (
              <Button
                className="crm-icon-button"
                data-testid="company-restore"
                aria-label={t("crm.restore")}
                title={t("crm.restore")}
                disabled={busy}
                onClick={() => restore.mutate({ record: company })}
              >
                <RotateCcw size={18} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            ) : (
              <Button
                className="crm-icon-button"
                data-testid="company-archive"
                aria-label={t("crm.companies.delete")}
                title={t("crm.companies.delete")}
                onClick={() => setDialog("archive")}
              >
                <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            ))}
        </span>
      </div>
      <div className="crm-detail-title">
        <CompanyMark />
        <div className="crm-detail-heading">
          <h1 id={`${baseId}-heading`} data-testid="company-heading">
            {company.name}
          </h1>
          {(company.industry || company.archivedAt) && (
            <p>
              {[company.industry, company.archivedAt ? t("crm.archived") : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      {!!projects.length && (
        <div className="crm-section">
          <div className="crm-section-heading">
            <h2>{t("crm.companies.clientOf")}</h2>
          </div>
          <div className="crm-chips">
            {projects.map((project) => (
              <Link
                key={project.id}
                className="crm-chip"
                data-testid="company-client-project"
                href={`/projects/${project.id}?view=stakeholders`}
                prefetch={false}
              >
                {project.name}
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="crm-section">
        <div className="crm-section-heading">
          <h2 id={`${baseId}-people`}>
            {t("crm.people")} · {t("crm.roles.company")}
            <span className="crm-count">{contacts.length}</span>
          </h2>
          {canManage && !company.archivedAt && (
            <Button
              data-testid="company-new-contact"
              onClick={() => setDialog("contact")}
            >
              <Plus size={14} aria-hidden="true" />
              {t("crm.contacts.new")}
            </Button>
          )}
        </div>
        <ul className="contact-rows" aria-labelledby={`${baseId}-people`}>
          {contacts.map((contact) => {
            const link = roles(contact);
            return (
              <ContactRoleRow
                key={contact.id}
                testIdPrefix="company-contact"
                dataId={contact.id}
                chipsId={`${baseId}-${contact.id}`}
                scope="company"
                title={contact.name}
                sub={contact.title}
                avatar={<ContactAvatar text={initials(contact.name)} />}
                href={`/contacts/${contact.id}`}
                roles={link?.roles ?? []}
                linked={!!link}
                canManage={canManage && !company.archivedAt}
                busy={busy || !links.data}
                open={editing === contact.id}
                onToggle={() =>
                  setEditing(editing === contact.id ? null : contact.id)
                }
                onChange={(next) =>
                  setRoles.mutate({ target, contact, roles: next })
                }
                onRemove={() => {
                  setEditing(null);
                  remove.mutate({ target, contact });
                }}
                removeLabel={t("crm.clearCompanyRoles")}
              />
            );
          })}
        </ul>
        {!contacts.length && <p className="crm-note">{t("crm.noPeople")}</p>}
        <p className="crm-note">{t("crm.companies.rolesNote")}</p>
      </div>
      {dialog === "edit" && (
        <CompanyForm
          company={company}
          busy={save.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(fields) =>
            save.mutate({
              company,
              fields,
              onSaved: () => setDialog(null),
            })
          }
        />
      )}
      {dialog === "contact" && (
        <ContactForm
          contact={null}
          companies={[company]}
          initialCompanyId={company.id}
          busy={saveContact.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(fields, companyId) =>
            saveContact.mutate({
              contact: null,
              fields,
              companyId,
              onSaved: () => setDialog(null),
            })
          }
        />
      )}
      {dialog === "archive" && (
        <ArchiveConfirm
          title={t("crm.companies.delete")}
          body={t("crm.companies.deleteConfirm", { name: company.name })}
          busy={archive.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            archive.mutate({
              record: company,
              onArchived: () => {
                setDialog(null);
                router.push("/companies");
              },
            })
          }
        />
      )}
    </section>
  );
}
