"use client";
import type { Task } from "@taff/schemas";
// Task 聯繫人 (prototype v2 phone 577–597, desktop 1600–1620), backed by the
// M12 contact links and the shared ContactRoleRow (M15).
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useCompanies, useContactLinks } from "../lib/crm-queries";
import { useProjects, useWorkspaceAccess } from "../lib/m5-queries";
import { ContactLinks } from "./crm/contact-links";

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
  if (!canRead) return null;
  const count = links.data?.length ?? 0;
  return (
    <section
      className="task-section task-contacts"
      aria-labelledby={headingId}
      data-testid="task-contacts"
    >
      <div className="task-section-heading">
        <h2 id={headingId}>{t("crm.contacts.title")}</h2>
        {!!count && <span className="task-section-count">{count}</span>}
      </div>
      {!task.projectId ? (
        <p className="crm-note" data-testid="task-contacts-no-project">
          {t("crm.contacts.needsProject")}
        </p>
      ) : (
        <ContactLinks
          workspaceId={task.workspaceId}
          target={{
            scope: "task",
            entityId: task.id,
            projectId: task.projectId,
          }}
          testIdPrefix="task-contact"
          links={links.data}
          companies={companies.data}
          clientCompanyId={project?.clientCompanyId}
          projectName={project?.name ?? ""}
          canManage={canManage}
          emptyText={t("crm.contacts.noneOnTask")}
        />
      )}
      {links.error && (
        <p className="alert" role="alert">
          {t(errorKey(links.error))}
        </p>
      )}
    </section>
  );
}
