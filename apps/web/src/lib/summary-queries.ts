import {
  type AudienceRecipient,
  type AudienceRecipientInput,
  type AudienceRecipientUpdate,
  type AudienceTag,
  type AudienceTagInput,
  type AudienceTagUpdate,
  audienceRecipientListSchema,
  audienceRecipientSchema,
  audienceTagListSchema,
  audienceTagSchema,
  type DailySummaryListQuery,
  dailySummaryListSchema,
  dailySummarySchema,
  issuedSummaryShareSchema,
  type ProjectAudienceTags,
  projectAudienceTagsSchema,
  type SummaryShare,
  summaryPreviewSchema,
  summaryShareListSchema,
  summaryShareSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";

/**
 * Shareholder summaries (ADR 0027). Every family below is in the realtime
 * invalidation list; none is persisted to IndexedDB.
 */
export const audienceTagsKey = (workspaceId: string) =>
  ["audience-tags", workspaceId] as const;
export const audienceRecipientsKey = (tagId: string) =>
  ["audience-recipients", tagId] as const;
export const projectAudienceTagsKey = (projectId: string) =>
  ["project-audience-tags", projectId] as const;
export const summariesKey = (
  workspaceId: string,
  query: DailySummaryListQuery = {},
) => ["summaries", workspaceId, query] as const;
export const summaryKey = (id: string) => ["summary", id] as const;
export const summarySharesKey = (summaryId: string) =>
  ["summary-shares", summaryId] as const;

const json = (body: unknown) => JSON.stringify(body);

export function useAudienceTags(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: audienceTagsKey(workspaceId),
    queryFn: () =>
      request(`/api/workspaces/${workspaceId}/audience-tags`).then(
        audienceTagListSchema.parse,
      ),
    enabled,
  });
}
export function useCreateAudienceTag(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AudienceTagInput) =>
      request(`/api/workspaces/${workspaceId}/audience-tags`, {
        method: "POST",
        body: json(body),
      }).then(audienceTagSchema.parse),
    onSuccess: (tag) =>
      client.setQueryData<AudienceTag[]>(
        audienceTagsKey(workspaceId),
        (current = []) => [...current, tag],
      ),
    onSettled: () =>
      client.invalidateQueries({ queryKey: audienceTagsKey(workspaceId) }),
  });
}
export function useUpdateAudienceTag(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AudienceTagUpdate & { id: string }) =>
      request(`/api/audience-tags/${id}`, {
        method: "PATCH",
        body: json(body),
      }).then(audienceTagSchema.parse),
    onSettled: () =>
      client.invalidateQueries({ queryKey: audienceTagsKey(workspaceId) }),
  });
}

export function useAudienceRecipients(tagId: string | null) {
  return useQuery({
    queryKey: audienceRecipientsKey(tagId ?? ""),
    queryFn: () =>
      request(`/api/audience-tags/${tagId}/recipients`).then(
        audienceRecipientListSchema.parse,
      ),
    enabled: !!tagId,
  });
}
export function useCreateAudienceRecipient(workspaceId: string, tagId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AudienceRecipientInput) =>
      request(`/api/audience-tags/${tagId}/recipients`, {
        method: "POST",
        body: json(body),
      }).then(audienceRecipientSchema.parse),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: audienceRecipientsKey(tagId) }),
        client.invalidateQueries({ queryKey: audienceTagsKey(workspaceId) }),
      ]),
  });
}
/** Optimistic: the row shows the new value at once and rolls back on error. */
export function useUpdateAudienceRecipient(tagId: string) {
  const client = useQueryClient();
  const key = audienceRecipientsKey(tagId);
  return useMutation({
    mutationFn: ({ id, ...body }: AudienceRecipientUpdate & { id: string }) =>
      request(`/api/audience-recipients/${id}`, {
        method: "PATCH",
        body: json(body),
      }).then(audienceRecipientSchema.parse),
    onMutate: async ({ id, version: _version, ...body }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AudienceRecipient[]>(key);
      client.setQueryData<AudienceRecipient[]>(key, (current) =>
        current?.map((row) => (row.id === id ? { ...row, ...body } : row)),
      );
      return { previous };
    },
    onError: (_error, _body, context) =>
      client.setQueryData(key, context?.previous),
    onSuccess: (row) =>
      client.setQueryData<AudienceRecipient[]>(key, (current) =>
        current?.map((item) => (item.id === row.id ? row : item)),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useProjectAudienceTags(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectAudienceTagsKey(projectId),
    queryFn: () =>
      request(`/api/projects/${projectId}/audience-tags`).then(
        projectAudienceTagsSchema.parse,
      ),
    enabled: enabled && !!projectId,
  });
}
/** Replaces a project's tag set optimistically; undo sends the previous set. */
export function useSetProjectAudienceTags(
  projectId: string,
  tags: AudienceTag[],
) {
  const client = useQueryClient();
  const key = projectAudienceTagsKey(projectId);
  return useMutation({
    mutationFn: (tagIds: string[]) =>
      request(`/api/projects/${projectId}/audience-tags`, {
        method: "PUT",
        body: json({ tagIds }),
      }).then(projectAudienceTagsSchema.parse),
    onMutate: async (tagIds) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ProjectAudienceTags>(key);
      client.setQueryData<ProjectAudienceTags>(key, {
        projectId,
        tags: tags
          .filter((tag) => tagIds.includes(tag.id))
          .map(({ id, kind, org, label }) => ({ id, kind, org, label })),
      });
      return { previous };
    },
    onError: (_error, _body, context) =>
      client.setQueryData(key, context?.previous),
    onSuccess: (value) => client.setQueryData(key, value),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useDailySummaries(
  workspaceId: string,
  query: DailySummaryListQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: summariesKey(workspaceId, query),
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId });
      if (query.tagId) params.set("tagId", query.tagId);
      if (query.recipientId) params.set("recipientId", query.recipientId);
      return request(`/api/summaries?${params}`).then(
        dailySummaryListSchema.parse,
      );
    },
    enabled,
  });
}
export function useDailySummary(id: string) {
  return useQuery({
    queryKey: summaryKey(id),
    queryFn: () =>
      request(`/api/summaries/${id}`).then(dailySummarySchema.parse),
    // A summary never changes after it is written.
    staleTime: Number.POSITIVE_INFINITY,
  });
}
export function useSummaryPreview() {
  return useMutation({
    mutationFn: (recipientId: string) =>
      request("/api/summaries/preview", {
        method: "POST",
        body: json({ recipientId }),
      }).then(summaryPreviewSchema.parse),
  });
}

export function useSummaryShares(summaryId: string | null) {
  return useQuery({
    queryKey: summarySharesKey(summaryId ?? ""),
    queryFn: () =>
      request(`/api/summaries/${summaryId}/shares`).then(
        summaryShareListSchema.parse,
      ),
    enabled: !!summaryId,
  });
}
export function useCreateSummaryShare(summaryId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expiresInDays: number) =>
      request(`/api/summaries/${summaryId}/shares`, {
        method: "POST",
        body: json({ expiresInDays }),
      }).then(issuedSummaryShareSchema.parse),
    onSettled: () =>
      client.invalidateQueries({ queryKey: summarySharesKey(summaryId) }),
  });
}
export function useRevokeSummaryShare(summaryId: string) {
  const client = useQueryClient();
  const key = summarySharesKey(summaryId);
  return useMutation({
    mutationFn: (shareId: string) =>
      request(`/api/summary-shares/${shareId}`, { method: "DELETE" }).then(
        summaryShareSchema.parse,
      ),
    onMutate: async (shareId) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SummaryShare[]>(key);
      client.setQueryData<SummaryShare[]>(key, (current) =>
        current?.map((share) =>
          share.id === shareId ? { ...share, status: "revoked" } : share,
        ),
      );
      return { previous };
    },
    onError: (_error, _body, context) =>
      client.setQueryData(key, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
