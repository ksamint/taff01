// Workspace (organization) mutations: create, add agent, invites and roles.
import {
  issuedWorkspaceInviteSchema,
  type Member,
  memberRoleInputSchema,
  memberSchema,
  type Workspace,
  type WorkspaceAgentInput,
  type WorkspaceCreate,
  type WorkspaceInvite,
  type WorkspaceInviteInput,
  workspaceAgentInputSchema,
  workspaceCreateSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteInputSchema,
  workspaceSchema,
} from "@taff/schemas";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "../api";
import { invalidateM3 } from "../m3-queries";
import { m3MutationKey, snapshotM3 } from "../optimistic-m3";
import { meKey, membersKey } from "../queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../query-snapshot";
import { sessionVersion } from "../session-cache";
import { replaceById } from "./replace";

export const invitesKey = (workspaceId: string) =>
  ["invites", workspaceId] as const;
/** The unsent "new organization" name, kept while the create is pending. */
export const orgDraftsKey = (userId: string) => ["org-drafts", userId] as const;

export type IssuedInviteLink = {
  link: string;
  expiresAt: string;
  emailDelivery: "sent" | "logged" | "failed";
};

/** Refreshes workspace data and the session once the last write settles. */
export function invalidateWorkspaces(client: QueryClient) {
  if (client.isMutating() > 1) return;
  return Promise.all([
    invalidateM3(client),
    client.invalidateQueries({ queryKey: meKey }),
  ]);
}

export function optimisticAgentMember(
  workspaceId: string,
  name: string,
  id: string,
): Member {
  return {
    id,
    workspaceId,
    userId: null,
    name,
    kind: "agent",
    role: "member",
  };
}

export function withMemberRole(
  current: Member[] | undefined,
  id: string,
  role: Member["role"],
) {
  return current?.map((item) => (item.id === id ? { ...item, role } : item));
}

export function optimisticInvite(
  workspaceId: string,
  body: WorkspaceInviteInput,
  id: string,
  now: number,
): WorkspaceInvite {
  return {
    ...body,
    id,
    workspaceId,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 86400000).toISOString(),
  };
}

export function withRevokedInvite(
  current: WorkspaceInvite[] | undefined,
  id: string,
) {
  return current?.map((item) =>
    item.id === id ? { ...item, status: "revoked" as const } : item,
  );
}

/** Creates an organization; `onCreated` closes the dialog and selects it. */
export function useCreateWorkspace(
  userId: string,
  { onCreated }: { onCreated?: (workspace: Workspace) => void } = {},
) {
  const client = useQueryClient();
  const drafts = orgDraftsKey(userId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: WorkspaceCreate) =>
      request("/api/workspaces", {
        method: "POST",
        body: JSON.stringify(workspaceCreateSchema.parse(body)),
      }).then(workspaceSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotQueries(client, [drafts]);
      client.setQueryData(drafts, body.name);
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (value, _, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      client.removeQueries({ queryKey: drafts });
      onCreated?.(value);
    },
    onSettled: () => invalidateWorkspaces(client),
  });
}

/** Adds an agent member; `onAdded` closes the dialog and clears the name. */
export function useAddWorkspaceAgent(
  workspaceId: string,
  { onAdded }: { onAdded?: (member: Member) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: WorkspaceAgentInput) =>
      request(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        body: JSON.stringify(workspaceAgentInputSchema.parse(body)),
      }).then(memberSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      client.setQueryData<Member[]>(membersKey(workspaceId), (current) => [
        ...(current ?? []),
        optimisticAgentMember(workspaceId, body.name, id),
      ]);
      snapshot.capture();
      return { id, snapshot };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (member, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Member[]>(membersKey(workspaceId), (current) =>
        replaceById(current, context.id, member),
      );
      onAdded?.(member);
    },
    onSettled: () => invalidateWorkspaces(client),
  });
}

/** Accepts an invitation token; `onAccepted` forgets it and selects the org. */
export function useAcceptWorkspaceInvite(
  token: string | null,
  { onAccepted }: { onAccepted?: (workspace: Workspace) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: () =>
      request("/api/workspace-invites/accept", {
        method: "POST",
        body: JSON.stringify(workspaceInviteAcceptSchema.parse({ token })),
      }).then(workspaceSchema.parse),
    onMutate: () => snapshotQueries(client, []),
    onSuccess: (value, _, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      onAccepted?.(value);
    },
    onSettled: () => invalidateWorkspaces(client),
  });
}

/** Changes a member's workspace role. */
export function useChangeMemberRole(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, next }: { id: string; next: Member["role"] }) =>
      request(`/api/workspaces/${workspaceId}/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify(memberRoleInputSchema.parse({ role: next })),
      }),
    onMutate: async ({ id, next }) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<Member[]>(membersKey(workspaceId), (current) =>
        withMemberRole(current, id, next),
      );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateWorkspaces(client),
  });
}

/**
 * Issues an invitation. `onStart` clears the previous link; `onIssued`
 * receives the one-time link when the session is unchanged. The cached list
 * keeps only the invite metadata.
 */
export function useIssueWorkspaceInvite(
  workspaceId: string,
  {
    onStart,
    onIssued,
  }: {
    onStart?: () => void;
    onIssued?: (issued: IssuedInviteLink) => void;
  } = {},
) {
  const client = useQueryClient();
  const key = invitesKey(workspaceId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: WorkspaceInviteInput) => {
      const version = sessionVersion(client);
      const { token, ...metadata } = issuedWorkspaceInviteSchema.parse(
        await request(`/api/workspaces/${workspaceId}/invites`, {
          method: "POST",
          body: JSON.stringify(workspaceInviteInputSchema.parse(body)),
        }),
      );
      if (version === sessionVersion(client))
        onIssued?.({
          link: `${window.location.origin}/#invite=${encodeURIComponent(token)}`,
          expiresAt: metadata.expiresAt,
          emailDelivery: metadata.emailDelivery,
        });
      return metadata;
    },
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      client.setQueryData<WorkspaceInvite[]>(key, (current) => [
        optimisticInvite(workspaceId, body, id, Date.now()),
        ...(current ?? []),
      ]);
      onStart?.();
      snapshot.capture();
      return { id, snapshot };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (value, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<WorkspaceInvite[]>(key, (current) =>
        replaceById(current, context.id, value),
      );
    },
    onSettled: () => invalidateWorkspaces(client),
  });
}

/** Revokes a pending invitation. */
export function useRevokeWorkspaceInvite(workspaceId: string) {
  const client = useQueryClient();
  const key = invitesKey(workspaceId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (id: string) =>
      request(`/api/workspace-invites/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<WorkspaceInvite[]>(key, (current) =>
        withRevokedInvite(current, id),
      );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateWorkspaces(client),
  });
}
