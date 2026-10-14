// Contact links on a task (M14 task detail, 聯繫人). Every write is optimistic,
// rolls back on error and shows a toast whose 撤銷 calls the inverse API
// operation (plan §2.4 items 6–7), never a cache snapshot.
import {
  type Contact,
  type ContactLink,
  type ContactRole,
  type ContactScope,
  roleExclusive,
  type SetContactRolesResult,
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
import { CRM_LINK_FAMILIES, contactLinksKey } from "../crm-queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../query-snapshot";
import { showToast } from "../toast";

export const crmMutationKey = ["crm-write"] as const;
const PATHS = { company: "companies", project: "projects", task: "tasks" };

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

/**
 * The inverse of a role PUT on a task: remove a new link (and the project
 * stakeholder it added), or restore the previous roles; then give each
 * replaced holder back the role it lost, with the roles it held before.
 */
export function undoRolesSteps(
  before: ContactLink[] | undefined,
  taskId: string,
  projectId: string | null,
  contact: Contact,
  result: Pick<
    SetContactRolesResult,
    "previousRoles" | "replaced" | "addedProjectStakeholder"
  >,
): ContactStep[] {
  const steps: ContactStep[] = [];
  if (result.previousRoles === null) {
    steps.push({ method: "DELETE", scope: "task", entityId: taskId, contact });
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
      scope: "task",
      entityId: taskId,
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
        scope: "task",
        entityId: taskId,
        contact: holder.contact,
        roles,
      });
  }
  return steps;
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

function invalidateCrm(client: QueryClient) {
  if (client.isMutating({ mutationKey: crmMutationKey }) > 1) return;
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      CRM_LINK_FAMILIES.includes(String(queryKey[0])),
  });
}

async function send(step: ContactStep, roles?: ContactRole[]) {
  const path = `/api/${PATHS[step.scope]}/${step.entityId}/contacts/${step.contact.id}`;
  return step.method === "PUT"
    ? request(path, {
        method: "PUT",
        body: JSON.stringify({ roles: roles ?? step.roles }),
      })
    : request(path, { method: "DELETE" });
}

/**
 * Runs the inverse steps in order as one tracked mutation: the task's
 * list changes at once and returns to the server's state if a step fails.
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
            step.method === "PUT"
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

type TaskRef = { id: string; projectId: string | null };

/**
 * Sets a contact's complete role set on a task (adding the link when it is
 * new). `projectName` names the project in the stakeholder toast.
 */
export function useSetTaskContactRoles(task: TaskRef, projectName: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = contactLinksKey("task", task.id);
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({
      contact,
      roles,
    }: {
      contact: Contact;
      roles: ContactRole[];
    }) =>
      setContactRolesResultSchema.parse(
        await send(
          {
            method: "PUT",
            scope: "task",
            entityId: task.id,
            contact,
            roles,
          },
          roles,
        ),
      ),
    onMutate: async ({ contact, roles }) => {
      const snapshot = await snapshotQueries(client, [key]);
      const before = client.getQueryData<ContactLink[]>(key);
      client.setQueryData<ContactLink[]>(key, (links) =>
        withContactRoles(links, "task", task.id, contact, roles),
      );
      return { snapshot, before };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (result, { contact }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<ContactLink[]>(key, (links) =>
        (links ?? []).map((link) =>
          link.contactId === contact.id ? result.link : link,
        ),
      );
      const steps = undoRolesSteps(
        context.before,
        task.id,
        task.projectId,
        contact,
        result,
      );
      showToast(
        rolesToastText(t, context.before, contact, result, projectName),
        { label: t("actions.undo"), run: () => runUndo(client, t, steps) },
      );
    },
    onSettled: () => invalidateCrm(client),
  });
}

/** Removes a contact from a task; undo re-adds it with the same roles. */
export function useRemoveTaskContact(task: TaskRef) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const key = contactLinksKey("task", task.id);
  return useMutation({
    mutationKey: crmMutationKey,
    mutationFn: async ({ contact }: { contact: Contact }) =>
      unlinkContactResultSchema.parse(
        await send({
          method: "DELETE",
          scope: "task",
          entityId: task.id,
          contact,
        }),
      ),
    onMutate: async ({ contact }) => {
      const snapshot = await snapshotQueries(client, [key]);
      const roles =
        client
          .getQueryData<ContactLink[]>(key)
          ?.find((link) => link.contactId === contact.id)?.roles ?? [];
      client.setQueryData<ContactLink[]>(key, (links) =>
        withoutContact(links, contact.id),
      );
      return { snapshot, roles };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (_, { contact }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const step: ContactStep = {
        method: "PUT",
        scope: "task",
        entityId: task.id,
        contact,
        roles: context.roles,
      };
      showToast(t("crm.toast.removed", { name: contact.name }), {
        label: t("actions.undo"),
        run: () => runUndo(client, t, [step]),
      });
    },
    onSettled: () => invalidateCrm(client),
  });
}
