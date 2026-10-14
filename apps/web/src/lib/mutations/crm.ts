// CRM writes (M14 task contacts, M15 companies, contacts and stakeholders).
// Every write shows a toast whose 撤銷 calls the inverse API operation (plan
// §2.4 items 6–7), never a cache snapshot; link writes are optimistic and
// roll back on error.
import { type Project, projectSchema } from "@taff/schemas";
import {
  type Company,
  type CompanyInput,
  type CompanyUpdate,
  type Contact,
  type ContactDetail,
  type ContactInput,
  type ContactLink,
  type ContactRole,
  type ContactScope,
  type ContactUpdate,
  companySchema,
  contactDetailSchema,
  contactSchema,
  roleExclusive,
  type SetContactRolesResult,
  setContactCompanyResultSchema,
  setContactRolesResultSchema,
  unlinkContactResultSchema,
} from "@taff/schemas/crm";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../api";
import {
  CRM_LINK_FAMILIES,
  CRM_PATHS,
  contactKey,
  contactLinksKey,
  contactLinksQuery,
} from "../crm-queries";
import { invalidateM3 } from "../m3-queries";
import { projectsKey } from "../m5-queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../query-snapshot";
import { showToast } from "../toast";

export const crmMutationKey = ["crm-write"] as const;

/** The entity a contact link belongs to; `projectId` is a task's project. */
export type LinkTarget = {
  scope: ContactScope;
  entityId: string;
  projectId: string | null;
};

/** One inverse API call: re-PUT a role set, or remove a link. */
export type ContactStep =
  | {
      method: "PUT";
      scope: ContactScope;
      entityId: string;
      contact: Contact;
      roles: ContactRole[];
    }
  | {
      method: "DELETE";
      scope: ContactScope;
      entityId: string;
      contact: Contact;
    };

/**
 * The link list after `contact` holds exactly `roles` on this entity:
 * exclusive roles move away from their other holders, as core does.
 */
export function withContactRoles(
  links: ContactLink[] | undefined,
  scope: ContactScope,
  entityId: string,
  contact: Contact,
  roles: ContactRole[],
): ContactLink[] {
  const moved = roles.filter(roleExclusive);
  const next = (links ?? []).map((link) =>
    link.contactId === contact.id
      ? { ...link, roles: [...roles] }
      : {
          ...link,
          roles: link.roles.filter((role) => !moved.includes(role)),
        },
  );
  return next.some((link) => link.contactId === contact.id)
    ? next
    : [
        ...next,
        { scope, entityId, contactId: contact.id, roles: [...roles], contact },
      ];
}

/** The link list without `contactId`. */
export function withoutContact(
  links: ContactLink[] | undefined,
  contactId: string,
): ContactLink[] {
  return (links ?? []).filter((link) => link.contactId !== contactId);
}

/** A contact page's links with one entity's roles set, or the link removed. */
export function withDetailRoles(
  detail: ContactDetail | undefined,
  scope: ContactScope,
  entityId: string,
  roles: ContactRole[] | null,
): ContactDetail | undefined {
  if (!detail) return detail;
  return {
    ...detail,
    links:
      roles === null
        ? detail.links.filter(
            (link) => !(link.scope === scope && link.entityId === entityId),
          )
        : detail.links.map((link) =>
            link.scope === scope && link.entityId === entityId
              ? { ...link, roles: [...roles] }
              : link,
          ),
  };
}

/**
 * The inverse of a role PUT: remove a new link (and the project stakeholder
 * a task link added), or restore the previous roles; then give each replaced
 * holder back the role it lost, with the roles it held before.
 */
export function undoRolesSteps(
  before: ContactLink[] | undefined,
  target: LinkTarget,
  contact: Contact,
  result: Pick<
    SetContactRolesResult,
    "previousRoles" | "replaced" | "addedProjectStakeholder"
  >,
): ContactStep[] {
  const { scope, entityId, projectId } = target;
  const steps: ContactStep[] = [];
  if (result.previousRoles === null) {
    steps.push({ method: "DELETE", scope, entityId, contact });
    if (result.addedProjectStakeholder && projectId)
      steps.push({
        method: "DELETE",
        scope: "project",
        entityId: projectId,
        contact,
      });
  } else
    steps.push({
      method: "PUT",
      scope,
      entityId,
      contact,
      roles: result.previousRoles,
    });
  const holders = new Map<string, ContactRole[]>();
  for (const { role, contactId } of result.replaced) {
    const previous = before?.find((link) => link.contactId === contactId);
    if (!previous) continue;
    holders.set(contactId, [
      ...new Set([...(holders.get(contactId) ?? previous.roles), role]),
    ]);
  }
  for (const [contactId, roles] of holders) {
    const holder = before?.find((link) => link.contactId === contactId);
    if (holder)
      steps.push({
        method: "PUT",
        scope,
        entityId,
        contact: holder.contact,
        roles,
      });
  }
  return steps;
}

/**
 * The inverse of removing a link: re-add it with its roles, then (for a
 * project stakeholder) every task link the removal cascaded away.
 */
export function undoRemoveSteps(
  target: LinkTarget,
  contact: Contact,
  roles: ContactRole[],
  cascaded: { entityId: string; roles: ContactRole[] }[],
): ContactStep[] {
  return [
    {
      method: "PUT",
      scope: target.scope,
      entityId: target.entityId,
      contact,
      roles,
    },
    ...cascaded.map(
      (link): ContactStep => ({
        method: "PUT",
        scope: "task",
        entityId: link.entityId,
        contact,
        roles: link.roles,
      }),
    ),
  ];
}

/** The toast for a role PUT: added, updated, replaced holders, new stakeholder. */
export function rolesToastText(
  t: TFunction,
  before: ContactLink[] | undefined,
  contact: Contact,
  result: Pick<
    SetContactRolesResult,
    "previousRoles" | "replaced" | "addedProjectStakeholder"
  >,
  projectName: string,
): string {
  const parts = [
    t(
      result.previousRoles === null
        ? "crm.toast.added"
        : "crm.toast.rolesUpdated",
      { name: contact.name },
    ),
  ];
  for (const { role, contactId } of result.replaced)
    parts.push(
      t("crm.toast.roleReplaced", {
        name: contact.name,
        role: t(`crm.role.${role}`),
        previous:
          before?.find((link) => link.contactId === contactId)?.contact.name ??
          t("crm.contacts.someone"),
      }),
    );
  if (result.addedProjectStakeholder)
    parts.push(
      t("crm.toast.addedStakeholder", {
        name: contact.name,
        project: projectName,
      }),
    );
  return parts.join(t("crm.toast.separator"));
}

/** The toast for a removal, with the cascaded task links when there were any. */
export function removeToastText(t: TFunction, name: string, count: number) {
  return count > 0
    ? t("crm.toast.removedWithLinks", { name, count })
    : t("crm.toast.removed", { name });
}

/** The toast for a company change, saying when old company roles were cleared. */
export function companyChangeToastText(
  t: TFunction,
  name: string,
  company: string | null,
  dropped: number,
) {
  const parts = [
    company
      ? t("crm.toast.companyChanged", { name, company })
      : t("crm.toast.companyCleared", { name }),
  ];
  if (dropped > 0) parts.push(t("crm.toast.rolesCleared"));
  return parts.join(t("crm.toast.separator"));
}

function invalidateCrm(client: QueryClient) {
  if (client.isMutating({ mutationKey: crmMutationKey }) > 1) return;
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      CRM_LINK_FAMILIES.includes(String(queryKey[0])),
  });
}

async function send(step: ContactStep) {
  const path = `/api/${CRM_PATHS[step.scope]}/${step.entityId}/contacts/${step.contact.id}`;
  return step.method === "PUT"
    ? request(path, {
        method: "PUT",
        body: JSON.stringify({ roles: step.roles }),
      })
    : request(path, { method: "DELETE" });
}

/**
 * Runs inverse link steps in order as one tracked mutation: the lists change
 * at once and return to the server's state if a step fails.
 */
function runUndo(client: QueryClient, t: TFunction, steps: ContactStep[]) {
  const mutation = client.getMutationCache().build(client, {
    mutationKey: crmMutationKey,
    mutationFn: async () => {
      for (const step of steps) await send(step);
    },
    onMutate: async () => {
      const keys = [
        ...new Set(
          steps.map((step) => JSON.stringify([step.scope, step.entityId])),
        ),
      ].map((key) => {
        const [scope, entityId] = JSON.parse(key) as [ContactScope, string];
        return contactLinksKey(scope, entityId);
      });
      const snapshot = await snapshotQueries(client, keys);
      for (const step of steps)
        client.setQueryData<ContactLink[]>(
          contactLinksKey(step.scope, step.entityId),
          (links) =>
            links === undefined
              ? links
              : step.method === "PUT"
                ? withContactRoles(
                    links,
                    step.scope,
                    step.entityId,
                    step.contact,
                    step.roles,
                  )
                : withoutContact(links, step.contact.id),
        );
      return snapshot;
    },
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot as Parameters<typeof restoreQueries>[1]);
      showToast(t(errorKey(error)));
    },
    onSettled: () => invalidateCrm(client),
  });
  void mutation.execute(undefined).catch(() => {});
}

/** Runs one inverse record call (PATCH or DELETE) as a tracked mutation. */
function runInverse(
  client: QueryClient,
  t: TFunction,
  call: () => Promise<unknown>,
  afterwards?: () => void,
) {
  const mutation = client.getMutationCache().build(client, {
    mutationKey: crmMutationKey,
    mutationFn: call,
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: () => afterwards?.(),
    onSettled: () => {
      void invalidateCrm(client);
      void invalidateM3(client);
    },
  });
  void mutation.execute(undefined).catch(() => {});
}

const undoAction = (t: TFunction, run: () => void) => ({
  label: t("actions.undo"),
  run,
});

/**
 * Sets a contact's complete role set on a company, project or task (adding
 * the link when it is new). `projectName` names the project in the toast
 * when a task link also adds the contact as a stakeholder.
 */
export function useSetContactRoles() {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      target,
      contact,
      roles,
    }: {
      target: LinkTarget;
      contact: Contact;
      roles: ContactRole[];
      projectName?: string;
    }) =>
      setContactRolesResultSchema.parse(
        await send({
          method: "PUT",
          scope: target.scope,
          entityId: target.entityId,
          contact,
          roles,
        }),
      ),
    onMutate: async ({ target, contact, roles }) => {
      const key = contactLinksKey(target.scope, target.entityId);
      // The previous holders name the toast and drive undo, so read them
      // even where the page did not list this entity's links (contact page).
      const before = await client
        .ensureQueryData(contactLinksQuery(target.scope, target.entityId))
        .catch(() => undefined);
      const snapshot = await snapshotQueries(client, [
        key,
        contactKey(contact.id),
      ]);
      client.setQueryData<ContactLink[]>(key, (links) =>
        withContactRoles(links, target.scope, target.entityId, contact, roles),
      );
      client.setQueryData<ContactDetail>(contactKey(contact.id), (detail) =>
        withDetailRoles(detail, target.scope, target.entityId, roles),
      );
      return { snapshot, before };
    },
    onError: (error, _, context) => {
      restoreQueries(client, context?.snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (result, { target, contact, projectName }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<ContactLink[]>(
        contactLinksKey(target.scope, target.entityId),
        (links) =>
          (links ?? []).map((link) =>
            link.contactId === contact.id ? result.link : link,
          ),
      );
      const steps = undoRolesSteps(context.before, target, contact, result);
      showToast(
        rolesToastText(t, context.before, contact, result, projectName ?? ""),
        undoAction(t, () => runUndo(client, t, steps)),
      );
    },
    onSettled: () => invalidateCrm(client),
  });
}

/**
 * Removes a contact's link to a company, project or task. Removing a project
 * stakeholder also removes its task links in that project (core cascades);
 * they are read first so undo can re-add every one with its roles.
 */
export function useRemoveContactLink() {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      target,
      contact,
    }: {
      target: LinkTarget;
      contact: Contact;
    }) => {
      const cascaded =
        target.scope === "project"
          ? contactDetailSchema
              .parse(await request(`/api/contacts/${contact.id}`))
              .links.filter(
                (link) =>
                  link.scope === "task" && link.projectId === target.entityId,
              )
              .map((link) => ({ entityId: link.entityId, roles: link.roles }))
          : [];
      const result = unlinkContactResultSchema.parse(
        await send({
          method: "DELETE",
          scope: target.scope,
          entityId: target.entityId,
          contact,
        }),
      );
      return { result, cascaded };
    },
    onMutate: async ({ target, contact }) => {
      const key = contactLinksKey(target.scope, target.entityId);
      const snapshot = await snapshotQueries(client, [
        key,
        contactKey(contact.id),
      ]);
      const roles =
        client
          .getQueryData<ContactLink[]>(key)
          ?.find((link) => link.contactId === contact.id)?.roles ??
        client
          .getQueryData<ContactDetail>(contactKey(contact.id))
          ?.links.find(
            (link) =>
              link.scope === target.scope && link.entityId === target.entityId,
          )?.roles ??
        [];
      client.setQueryData<ContactLink[]>(key, (links) =>
        links === undefined ? links : withoutContact(links, contact.id),
      );
      client.setQueryData<ContactDetail>(contactKey(contact.id), (detail) =>
        withDetailRoles(detail, target.scope, target.entityId, null),
      );
      return { snapshot, roles };
    },
    onError: (error, _, context) => {
      restoreQueries(client, context?.snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: ({ result, cascaded }, { target, contact }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const steps = undoRemoveSteps(target, contact, context.roles, cascaded);
      showToast(
        removeToastText(t, contact.name, result.cascadedTaskLinks),
        undoAction(t, () => runUndo(client, t, steps)),
      );
    },
    onSettled: () => invalidateCrm(client),
  });
}

type CompanyFields = { name: string; industry: string };

/**
 * Creates a company or saves its name and industry. Undo archives a new
 * company (admins only, `canArchive`) or restores the previous fields.
 */
export function useSaveCompany(workspaceId: string, canArchive: boolean) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      company,
      fields,
    }: {
      company: Company | null;
      fields: CompanyFields;
      onSaved?: (company: Company) => void;
    }) =>
      companySchema.parse(
        company
          ? await request(`/api/companies/${company.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                version: company.version,
                ...fields,
              } satisfies CompanyUpdate),
            })
          : await request(`/api/companies?workspaceId=${workspaceId}`, {
              method: "POST",
              body: JSON.stringify(fields satisfies CompanyInput),
            }),
      ),
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: (saved, { company, onSaved }) => {
      onSaved?.(saved);
      if (!company)
        showToast(
          t("crm.toast.companyCreated", { name: saved.name }),
          canArchive
            ? undoAction(t, () =>
                runInverse(client, t, () =>
                  request(
                    `/api/companies/${saved.id}?version=${saved.version}`,
                    { method: "DELETE" },
                  ),
                ),
              )
            : undefined,
        );
      else
        showToast(
          t("crm.toast.saved", { name: saved.name }),
          undoAction(t, () =>
            runInverse(client, t, () =>
              request(`/api/companies/${saved.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  version: saved.version,
                  name: company.name,
                  industry: company.industry,
                } satisfies CompanyUpdate),
              }),
            ),
          ),
        );
    },
    onSettled: () => invalidateCrm(client),
  });
}

type ContactFields = {
  name: string;
  title: string;
  phone: string;
  email: string;
};

/**
 * Creates a contact (with its company) or saves its fields. Undo archives a
 * new contact (admins only) or restores the previous fields.
 */
export function useSaveContact(workspaceId: string, canArchive: boolean) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      contact,
      fields,
      companyId,
    }: {
      contact: Contact | null;
      fields: ContactFields;
      companyId?: string | null;
      onSaved?: (contact: Contact) => void;
    }) =>
      contactSchema.parse(
        contact
          ? await request(`/api/contacts/${contact.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                version: contact.version,
                ...fields,
              } satisfies ContactUpdate),
            })
          : await request(`/api/contacts?workspaceId=${workspaceId}`, {
              method: "POST",
              body: JSON.stringify({
                ...fields,
                companyId: companyId ?? null,
              } satisfies ContactInput),
            }),
      ),
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: (saved, { contact, onSaved }) => {
      onSaved?.(saved);
      if (!contact)
        showToast(
          t("crm.toast.contactCreated", { name: saved.name }),
          canArchive
            ? undoAction(t, () =>
                runInverse(client, t, () =>
                  request(
                    `/api/contacts/${saved.id}?version=${saved.version}`,
                    { method: "DELETE" },
                  ),
                ),
              )
            : undefined,
        );
      else
        showToast(
          t("crm.toast.saved", { name: saved.name }),
          undoAction(t, () =>
            runInverse(client, t, () =>
              request(`/api/contacts/${saved.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  version: saved.version,
                  name: contact.name,
                  title: contact.title,
                  // Hidden details (null) stay as they are.
                  ...(contact.phone === null ? {} : { phone: contact.phone }),
                  ...(contact.email === null ? {} : { email: contact.email }),
                } satisfies ContactUpdate),
              }),
            ),
          ),
        );
    },
    onSettled: () => invalidateCrm(client),
  });
}

/**
 * Archives a company or contact (D4: 刪除 archives) with `?version=`; undo
 * restores it with the archived record's version.
 */
export function useArchiveCrmRecord(kind: "company" | "contact") {
  const client = useQueryClient();
  const { t } = useTranslation();
  const path = kind === "company" ? "companies" : "contacts";
  const schema = kind === "company" ? companySchema : contactSchema;
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      record,
    }: {
      record: { id: string; name: string; version: number };
      onArchived?: () => void;
      onRestored?: () => void;
    }) =>
      schema.parse(
        await request(`/api/${path}/${record.id}?version=${record.version}`, {
          method: "DELETE",
        }),
      ),
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: (archived, { onArchived, onRestored }) => {
      onArchived?.();
      showToast(
        t("crm.toast.deleted", { name: archived.name }),
        undoAction(t, () =>
          runInverse(
            client,
            t,
            () =>
              request(`/api/${path}/${archived.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  version: archived.version,
                  archived: false,
                }),
              }),
            onRestored,
          ),
        ),
      );
    },
    onSettled: () => {
      void invalidateCrm(client);
      void invalidateM3(client);
    },
  });
}

/** Restores an archived company or contact; undo archives it again. */
export function useRestoreCrmRecord(kind: "company" | "contact") {
  const client = useQueryClient();
  const { t } = useTranslation();
  const path = kind === "company" ? "companies" : "contacts";
  const schema = kind === "company" ? companySchema : contactSchema;
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      record,
    }: {
      record: { id: string; version: number };
    }) =>
      schema.parse(
        await request(`/api/${path}/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ version: record.version, archived: false }),
        }),
      ),
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: (restored) =>
      showToast(
        t("crm.toast.restored", { name: restored.name }),
        undoAction(t, () =>
          runInverse(client, t, () =>
            request(`/api/${path}/${restored.id}?version=${restored.version}`, {
              method: "DELETE",
            }),
          ),
        ),
      ),
    onSettled: () => invalidateCrm(client),
  });
}

/**
 * Moves a contact to another company (or none). Core drops the company-role
 * link at the old employer; undo moves the contact back and re-adds that
 * link with its roles (`dropped`, read from the contact page before).
 */
export function useSetContactCompany() {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      contact,
      companyId,
    }: {
      contact: Contact;
      companyId: string | null;
      companyName: string | null;
      dropped: { entityId: string; roles: ContactRole[] }[];
    }) =>
      setContactCompanyResultSchema.parse(
        await request(`/api/contacts/${contact.id}/company`, {
          method: "PATCH",
          body: JSON.stringify({ version: contact.version, companyId }),
        }),
      ),
    onError: (error) => showToast(t(errorKey(error))),
    onSuccess: (result, { companyName, dropped }) => {
      const moved = result.contact;
      showToast(
        companyChangeToastText(t, moved.name, companyName, result.dropped),
        undoAction(t, () =>
          runInverse(client, t, async () => {
            const back = setContactCompanyResultSchema.parse(
              await request(`/api/contacts/${moved.id}/company`, {
                method: "PATCH",
                body: JSON.stringify({
                  version: moved.version,
                  companyId: result.previousCompanyId,
                }),
              }),
            );
            if (result.dropped > 0)
              for (const link of dropped)
                await send({
                  method: "PUT",
                  scope: "company",
                  entityId: link.entityId,
                  contact: back.contact,
                  roles: link.roles,
                });
          }),
        ),
      );
    },
    onSettled: () => invalidateCrm(client),
  });
}

/**
 * Sets a project's client company (finance:manage). The project list changes
 * at once; undo sets the previous client back with the saved version.
 */
export function useSetClientCompany(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = projectsKey(workspaceId);
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      project,
      companyId,
    }: {
      project: Project;
      companyId: string | null;
      companyName: string | null;
    }) =>
      projectSchema.parse(
        await request(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            version: project.version,
            clientCompanyId: companyId,
          }),
        }),
      ),
    onMutate: async ({ project, companyId }) => {
      const snapshot = await snapshotQueries(client, [key]);
      client.setQueryData<Project[]>(key, (projects) =>
        projects?.map((item) =>
          item.id === project.id
            ? { ...item, clientCompanyId: companyId }
            : item,
        ),
      );
      return { snapshot };
    },
    onError: (error, _, context) => {
      restoreQueries(client, context?.snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { project, companyName }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Project[]>(key, (projects) =>
        projects?.map((item) => (item.id === saved.id ? saved : item)),
      );
      showToast(
        companyName
          ? t("crm.toast.clientSet", { company: companyName })
          : t("crm.toast.clientCleared"),
        undoAction(t, () =>
          runInverse(client, t, () =>
            request(`/api/projects/${saved.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                version: saved.version,
                clientCompanyId: project.clientCompanyId,
              }),
            }),
          ),
        ),
      );
    },
    onSettled: () => {
      void invalidateCrm(client);
      void invalidateM3(client);
    },
  });
}
