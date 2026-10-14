// CRM reads (M12 backend). Keys start with the realtime families in
// `realtime.ts`, so a change event refreshes them: "contact-links",
// "contacts", "contact", "companies", "company" and "crm-search".
import {
  type ContactScope,
  companyDetailSchema,
  companyListSchema,
  contactDetailSchema,
  contactLinkListSchema,
  contactListSchema,
  crmSearchResultSchema,
} from "@taff/schemas/crm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const contactLinksKey = (scope: ContactScope, entityId: string) =>
  ["contact-links", scope, entityId] as const;
export const contactsKey = (workspaceId: string) =>
  ["contacts", workspaceId] as const;
export const companiesKey = (workspaceId: string) =>
  ["companies", workspaceId] as const;
/** Archived companies too (the admins' 已封存 filter). */
export const allCompaniesKey = (workspaceId: string) =>
  ["companies", workspaceId, "archived"] as const;
export const companyKey = (id: string) => ["company", id] as const;
export const contactKey = (id: string) => ["contact", id] as const;
export const crmSearchKey = (workspaceId: string, query: string) =>
  ["crm-search", workspaceId, query] as const;
/** Every CRM family a CRM write can change. */
export const CRM_LINK_FAMILIES = [
  "contact-links",
  "contact",
  "company",
  "contacts",
  "companies",
  "crm-search",
  "crm-audit",
];

export const CRM_PATHS = {
  company: "companies",
  project: "projects",
  task: "tasks",
} as const;

/** GET …/contacts for one entity, shared by the hook and the mutations. */
export function contactLinksQuery(scope: ContactScope, entityId: string) {
  return {
    queryKey: contactLinksKey(scope, entityId),
    queryFn: async () =>
      contactLinkListSchema.parse(
        await request(`/api/${CRM_PATHS[scope]}/${entityId}/contacts`),
      ),
  };
}

/** The contacts linked to a company, project or task, with their roles. */
export function useContactLinks(scope: ContactScope, entityId: string | null) {
  const client = useQueryClient();
  return useQuery({
    ...contactLinksQuery(scope, entityId ?? ""),
    enabled:
      !!entityId &&
      !entityId.startsWith("optimistic:") &&
      currentSession(client)?.confirmed !== false,
    retry: false,
  });
}

/** The workspace's active contacts, for lists and the add-contact picker. */
export function useContacts(workspaceId: string, enabled = true) {
  const client = useQueryClient();
  return useQuery({
    queryKey: contactsKey(workspaceId),
    enabled: enabled && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      contactListSchema.parse(
        await request(`/api/contacts?workspaceId=${workspaceId}`),
      ),
    retry: false,
  });
}

/** The workspace's active companies, to name each contact's employer. */
export function useCompanies(workspaceId: string, enabled = true) {
  return useCompanyList(workspaceId, false, enabled);
}

/** Active companies, or every company with `includeArchived` (admins). */
export function useCompanyList(
  workspaceId: string,
  includeArchived: boolean,
  enabled = true,
) {
  const client = useQueryClient();
  return useQuery({
    queryKey: includeArchived
      ? allCompaniesKey(workspaceId)
      : companiesKey(workspaceId),
    enabled: enabled && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      companyListSchema.parse(
        await request(
          `/api/companies?workspaceId=${workspaceId}${includeArchived ? "&includeArchived=true" : ""}`,
        ),
      ),
    retry: false,
  });
}

/** One company with its employees, company-role links and client projects. */
export function useCompany(id: string | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: companyKey(id ?? ""),
    enabled: !!id && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      companyDetailSchema.parse(await request(`/api/companies/${id}`)),
    retry: false,
  });
}

/** One contact with its employer and every company, project and task link. */
export function useContact(id: string | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: contactKey(id ?? ""),
    enabled: !!id && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      contactDetailSchema.parse(await request(`/api/contacts/${id}`)),
    retry: false,
  });
}

/** Companies and contacts matching ⌘K text (names and titles; details only when allowed). */
export function useCrmSearch(
  workspaceId: string,
  query: string,
  enabled: boolean,
) {
  const client = useQueryClient();
  return useQuery({
    queryKey: crmSearchKey(workspaceId, query),
    enabled: enabled && !!query && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      crmSearchResultSchema.parse(
        await request(
          `/api/workspaces/${workspaceId}/crm/search?q=${encodeURIComponent(query)}`,
        ),
      ),
    retry: false,
  });
}
