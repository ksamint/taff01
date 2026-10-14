// Agent profile, permission and grant mutations (agent profile, run panel and
// review grant controls).
import {
  type AgentPermissionInput,
  type AgentProfile,
  type AgentProfileInput,
  agentPermissionInputSchema,
  agentProfileInputSchema,
  type DecideGrant,
  decideGrantSchema,
  type Grant,
  type Member,
  type RequestGrant,
  requestGrantSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { agentKey, invalidateM3 } from "../m3-queries";
import { m3MutationKey, resolveInbox, snapshotM3 } from "../optimistic-m3";
import { restoreQueries } from "../query-snapshot";

type AgentMember = Pick<Member, "id" | "workspaceId">;

export function withAgentProfileInput(
  current: AgentProfile | undefined,
  body: AgentProfileInput,
) {
  return current ? { ...current, ...body } : current;
}

export function withAgentPermission(
  current: AgentProfile | undefined,
  body: AgentPermissionInput,
) {
  return current
    ? {
        ...current,
        permissions: current.permissions.map((item) =>
          item.capability === body.capability ? body : item,
        ),
      }
    : current;
}

/** The pending grant shown until the server answers a grant request. */
export function optimisticGrant(
  agent: AgentMember,
  body: RequestGrant,
  id: string,
  now: string,
): Grant {
  return {
    id,
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    capability: body.capability,
    taskId: body.taskId ?? null,
    runId: body.runId ?? null,
    reason: body.reason,
    status: "pending",
    expiresAt: null,
    decidedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function withPendingGrant(
  current: AgentProfile | undefined,
  grant: Grant,
) {
  return current ? { ...current, grants: [grant, ...current.grants] } : current;
}

export function decidedGrantStatus(
  decision: DecideGrant["decision"],
): Grant["status"] {
  return decision === "allow"
    ? "allowed"
    : decision === "deny"
      ? "denied"
      : "revoked";
}

export function withGrantDecision(
  current: AgentProfile | undefined,
  grantId: string,
  body: DecideGrant,
  actorId: string | undefined,
) {
  return current
    ? {
        ...current,
        grants: current.grants.map((item) =>
          item.id === grantId
            ? {
                ...item,
                status: decidedGrantStatus(body.decision),
                expiresAt: body.expiresAt ?? item.expiresAt,
                decidedBy: actorId ?? item.decidedBy,
              }
            : item,
        ),
      }
    : current;
}

/** Saves supervisor, review policy and limits for an agent. */
export function useSaveAgentProfile(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: AgentProfileInput) =>
      request(`/api/agents/${agentId}`, {
        method: "PATCH",
        body: JSON.stringify(agentProfileInputSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(agentId), (current) =>
        withAgentProfileInput(current, body),
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}

/** Sets one capability's standing decision for an agent. */
export function useSetAgentPermission(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: AgentPermissionInput) =>
      request(`/api/agents/${agentId}/permissions`, {
        method: "PUT",
        body: JSON.stringify(agentPermissionInputSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(agentId), (current) =>
        withAgentPermission(current, body),
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}

/** Requests a temporary grant for an agent; `onRequested` clears the form. */
export function useRequestGrant(
  agent: AgentMember,
  { onRequested }: { onRequested?: () => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: RequestGrant) =>
      request(`/api/agents/${agent.id}/grants`, {
        method: "POST",
        body: JSON.stringify(requestGrantSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const now = new Date().toISOString();
      client.setQueryData<AgentProfile>(agentKey(agent.id), (current) =>
        current
          ? withPendingGrant(
              current,
              optimisticGrant(
                agent,
                body,
                `optimistic:${crypto.randomUUID()}`,
                now,
              ),
            )
          : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: () => onRequested?.(),
    onSettled: () => invalidateM3(client),
  });
}

/** Allows, denies or revokes a grant and resolves its inbox item. */
export function useDecideGrant(
  grant: Pick<Grant, "id" | "agentId">,
  actorId: string | undefined,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: DecideGrant) =>
      request(`/api/grants/${grant.id}/decision`, {
        method: "POST",
        body: JSON.stringify(decideGrantSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(grant.agentId), (current) =>
        withGrantDecision(current, grant.id, body, actorId),
      );
      resolveInbox(client, (item) => item.grantId === grant.id);
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}
