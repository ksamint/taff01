// MCP agent-token mutations: issue, regenerate, revoke and undo a revoke.
import {
  type AgentToken,
  type CreateAgentToken,
  type IssuedAgentToken,
  issuedAgentTokenSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "../api";
import { m3MutationKey } from "../optimistic-m3";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../query-snapshot";

export const agentTokensKey = (workspaceId: string) => [
  "agent-tokens",
  workspaceId,
];
export const mcpCallsKey = (workspaceId: string) => ["mcp-calls", workspaceId];

/** The token row shown until the server returns the issued token. */
export function optimisticAgentToken(
  body: CreateAgentToken,
  id: string,
  createdBy: string,
  now: string,
): AgentToken {
  return {
    ...body,
    id,
    createdBy,
    prefix: "",
    createdAt: now,
    revokedAt: null,
    lastUsedAt: null,
  };
}

export function withRevokedToken(
  current: AgentToken[] = [],
  id: string,
  now: string,
) {
  return current.map((token) =>
    token.id === id ? { ...token, revokedAt: now } : token,
  );
}

/**
 * Issues an agent token. `onIssued` receives the one-time secret; the cached
 * list keeps only its metadata.
 */
export function useCreateAgentToken(
  workspace: { id: string; memberId: string },
  { onIssued }: { onIssued?: (token: IssuedAgentToken) => void } = {},
) {
  const client = useQueryClient();
  const tokensKey = agentTokensKey(workspace.id);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: CreateAgentToken) =>
      issuedAgentTokenSchema.parse(
        await request("/api/agent-tokens", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = (await snapshotQueries(client, [tokensKey])).start();
      const id = `optimistic:${crypto.randomUUID()}`;
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) => [
        optimisticAgentToken(
          body,
          id,
          workspace.memberId,
          new Date().toISOString(),
        ),
        ...current,
      ]);
      snapshot.capture();
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (token, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const { token: _secret, ...metadata } = token;
      client.setQueryData<AgentToken[]>(tokensKey, (current) =>
        current?.map((item) => (item.id === context.id ? metadata : item)),
      );
      onIssued?.(token);
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function withRestoredToken(current: AgentToken[] = [], id: string) {
  return current.map((token) =>
    token.id === id ? { ...token, revokedAt: null } : token,
  );
}

/** The new row first, the replaced token marked revoked. */
export function withRegeneratedToken(
  current: AgentToken[] = [],
  replaced: AgentToken,
  next: AgentToken,
  now: string,
) {
  return [next, ...withRevokedToken(current, replaced.id, now)];
}

/** The new token was issued but the old one could not be revoked. */
export class PartialRegenerateError extends ApiError {
  constructor(
    readonly issued: IssuedAgentToken,
    cause: unknown,
  ) {
    super(
      cause instanceof ApiError ? cause.code : "internal_error",
      cause instanceof ApiError ? cause.status : undefined,
    );
  }
}

/** Issues the replacement first, then revokes the old token. */
export async function regenerateAgentToken(
  old: AgentToken,
): Promise<IssuedAgentToken> {
  const body: CreateAgentToken = {
    workspaceId: old.workspaceId,
    memberId: old.memberId,
    name: old.name,
    scopes: old.scopes,
  };
  const issued = issuedAgentTokenSchema.parse(
    await request("/api/agent-tokens", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  try {
    await request<AgentToken>(`/api/agent-tokens/${old.id}`, {
      method: "DELETE",
    });
  } catch (error) {
    throw new PartialRegenerateError(issued, error);
  }
  return issued;
}

/**
 * Regenerates a token: issues a new one with the same name, agent and scopes,
 * then revokes the old one, in that order, so a failure never leaves the
 * agent without a working token. `onIssued` receives the one-time secret.
 */
export function useRegenerateAgentToken(
  workspace: { id: string; memberId: string },
  { onIssued }: { onIssued?: (token: IssuedAgentToken) => void } = {},
) {
  const client = useQueryClient();
  const tokensKey = agentTokensKey(workspace.id);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: regenerateAgentToken,
    onMutate: async (old) => {
      const snapshot = (await snapshotQueries(client, [tokensKey])).start();
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<AgentToken[]>(tokensKey, (current) =>
        withRegeneratedToken(
          current,
          old,
          optimisticAgentToken(
            {
              workspaceId: old.workspaceId,
              memberId: old.memberId,
              name: old.name,
              scopes: old.scopes,
            },
            id,
            workspace.memberId,
            now,
          ),
          now,
        ),
      );
      snapshot.capture();
      return { snapshot, id };
    },
    onError: (error, _, context) => {
      restoreQueries(client, context?.snapshot);
      // The new secret exists server-side; show it once rather than lose it.
      if (error instanceof PartialRegenerateError) onIssued?.(error.issued);
    },
    onSuccess: (token, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      const { token: _secret, ...metadata } = token;
      client.setQueryData<AgentToken[]>(tokensKey, (current) =>
        current?.map((item) => (item.id === context.id ? metadata : item)),
      );
      onIssued?.(token);
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
}

/**
 * Revokes an agent token; `onStart` closes the confirmation and `onRevoked`
 * offers undo once the server has revoked it.
 */
export function useRevokeAgentToken(
  workspaceId: string,
  {
    onStart,
    onRevoked,
  }: { onStart?: () => void; onRevoked?: (token: AgentToken) => void } = {},
) {
  const client = useQueryClient();
  const tokensKey = agentTokensKey(workspaceId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (id: string) =>
      request<AgentToken>(`/api/agent-tokens/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const snapshot = (await snapshotQueries(client, [tokensKey])).start();
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) =>
        withRevokedToken(current, id, new Date().toISOString()),
      );
      onStart?.();
      return snapshot.capture();
    },
    onError: (_, __, context) => {
      restoreQueries(client, context);
    },
    onSuccess: (token) => onRevoked?.(token),
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
}

/** Undoes a person's recent revocation (the toast's 撤銷 action). */
export function useRestoreAgentToken(workspaceId: string) {
  const client = useQueryClient();
  const tokensKey = agentTokensKey(workspaceId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (id: string) =>
      request<AgentToken>(`/api/agent-tokens/${id}/restore`, {
        method: "POST",
      }),
    onMutate: async (id) => {
      const snapshot = (await snapshotQueries(client, [tokensKey])).start();
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) =>
        withRestoredToken(current, id),
      );
      return snapshot.capture();
    },
    onError: (_, __, context) => {
      restoreQueries(client, context);
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
}
