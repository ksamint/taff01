// MCP agent-token mutations (issue and revoke).
import {
  type AgentToken,
  type CreateAgentToken,
  type IssuedAgentToken,
  issuedAgentTokenSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
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
      const snapshot = await snapshotQueries(client, [tokensKey]);
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

/** Revokes an agent token; `onStart` closes the confirmation. */
export function useRevokeAgentToken(
  workspaceId: string,
  { onStart }: { onStart?: () => void } = {},
) {
  const client = useQueryClient();
  const tokensKey = agentTokensKey(workspaceId);
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (id: string) =>
      request<AgentToken>(`/api/agent-tokens/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const snapshot = await snapshotQueries(client, [tokensKey]);
      client.setQueryData<AgentToken[]>(tokensKey, (current = []) =>
        withRevokedToken(current, id, new Date().toISOString()),
      );
      onStart?.();
      return snapshot;
    },
    onError: (_, __, context) => {
      restoreQueries(client, context);
    },
    onSettled: () => client.invalidateQueries({ queryKey: tokensKey }),
  });
}
