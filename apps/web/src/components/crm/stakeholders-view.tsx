"use client";
import "../../styles/crm.css";
// 相關方 (M15): a project's client company and stakeholders with roles
// (prototype v2 phone 333–360, desktop 1239–1269). The client company is
// editable with finance:manage (admins); everyone else reads it.
import type { Project } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import Link from "next/link";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../../lib/api";
import { useCompanies, useContactLinks } from "../../lib/crm-queries";
import { crmMutationKey, useSetClientCompany } from "../../lib/mutations/crm";
import { useWorkspaceAccess } from "../../lib/queries";
import { ContactLinks } from "./contact-links";
import { CompanyMark } from "./contact-role-row";

export function StakeholdersView({
  workspaceId,
  project,
}: {
  workspaceId: string;
  project: Project | undefined;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const access = useWorkspaceAccess(workspaceId);
  const canRead = !!access.data?.canReadCrm;
  const links = useContactLinks(
    "project",
    canRead ? (project?.id ?? null) : null,
  );
  const companies = useCompanies(workspaceId, canRead);
  const setClient = useSetClientCompany(workspaceId);
  const busy = useIsMutating({ mutationKey: crmMutationKey }) > 0;
  if (access.isPending) return <p className="loading">{t("loading")}</p>;
  if (!canRead)
    return (
      <p className="crm-empty" data-testid="crm-no-access">
        {t("crm.noAccess")}
      </p>
    );
  if (!project)
    return (
      <p className="crm-empty" data-testid="stakeholders-pick-project">
        {t("crm.stakeholders.pickProject")}
      </p>
    );
  // finance:manage is admin-only, the same rule as finance:read (D7).
  const canSetClient =
    !!access.data?.canReadFinance &&
    !!access.data?.canManageProjects &&
    !project.archived;
  const client = companies.data?.find(
    (company) => company.id === project.clientCompanyId,
  );
  const count = links.data?.length ?? 0;
  return (
    <section
      className="stakeholders-view"
      data-testid="stakeholders-view"
      aria-labelledby={`${baseId}-stake`}
    >
      <div className="crm-section">
        <div className="crm-section-heading">
          <h2 id={`${baseId}-client`}>{t("crm.client")}</h2>
        </div>
        <div className="stakeholders-client">
          <CompanyMark />
          {canSetClient ? (
            <select
              aria-labelledby={`${baseId}-client`}
              data-testid="client-company-select"
              value={project.clientCompanyId ?? ""}
              disabled={busy || !companies.data}
              onChange={(event) => {
                const companyId = event.target.value || null;
                setClient.mutate({
                  project,
                  companyId,
                  companyName:
                    companies.data?.find((company) => company.id === companyId)
                      ?.name ?? null,
                });
              }}
            >
              <option value="">{t("crm.noClient")}</option>
              {(companies.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          ) : client ? (
            <Link
              className="stakeholders-client-name"
              data-testid="client-company"
              href={`/companies/${client.id}`}
              prefetch={false}
            >
              {client.name}
            </Link>
          ) : (
            <span
              className="stakeholders-client-name"
              data-testid="client-company"
            >
              {t("crm.noClient")}
            </span>
          )}
        </div>
      </div>
      <div className="crm-section">
        <div className="crm-section-heading">
          <h2 id={`${baseId}-stake`}>
            {t("crm.stakeholders.title")}
            <span className="crm-count" data-testid="stakeholders-count">
              {count}
            </span>
          </h2>
        </div>
        <ContactLinks
          workspaceId={workspaceId}
          target={{ scope: "project", entityId: project.id, projectId: null }}
          testIdPrefix="stakeholder"
          links={links.data}
          companies={companies.data}
          clientCompanyId={project.clientCompanyId}
          projectName={project.name}
          canManage={!!access.data?.canManageCrm && !project.archived}
          emptyText={t("crm.stakeholders.empty")}
          removeLabel={t("crm.removeFromProject")}
        />
        <p className="crm-note">{t("crm.stakeholders.note")}</p>
        {links.error && (
          <p className="alert" role="alert">
            {t(errorKey(links.error))}
          </p>
        )}
      </div>
    </section>
  );
}
