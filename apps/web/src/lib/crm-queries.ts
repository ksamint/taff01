// CRM reads (M12 backend). Keys start with the realtime families in
// `realtime.ts`, so a change event refreshes them: "contact-links",
// "contacts", "companies" and "crm-search".
import {
  type ContactScope,
  companyListSchema,
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
export const crmSearchKey = (workspaceId: string, query: string) =>
  ["crm-search", workspaceId, query] as const;
/** Every CRM family a contact-link write can change. */
export const CRM_LINK_FAMILIES = [
  "contact-links",
  "contact",
  "company",
  "contacts",
  "crm-search",
];

const PATHS = { company: "companies", project: "projects", task: "tasks" };

/** The contacts linked to a company, project or task, with their roles. */
export function useContactLinks(scope: ContactScope, entityId: string | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: contactLinksKey(scope, entityId ?? ""),
    enabled:
      !!entityId &&
      !entityId.startsWith("optimistic:") &&
      currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      contactLinkListSchema.parse(
        await request(`/api/${PATHS[scope]}/${entityId}/contacts`),
      ),
    retry: false,
  });
}

/** The workspace's active contacts, for the add-contact picker. */
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
  const client = useQueryClient();
  return useQuery({
    queryKey: companiesKey(workspaceId),
    enabled: enabled && currentSession(client)?.confirmed !== false,
    queryFn: async () =>
      companyListSchema.parse(
        await request(`/api/companies?workspaceId=${workspaceId}`),
      ),
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
