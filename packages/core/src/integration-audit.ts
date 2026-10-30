import {
  activity,
  agentTokens,
  type Database,
  type Transaction,
} from "@taff/db";
import {
  type ApprovedAgentOperation,
  integrationAuditQuerySchema,
  integrationPermissionQuerySchema,
  type TrustedReviewReceipt,
} from "@taff/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import type { Action, Actor, Resource } from "./permissions";

function permissionSnapshot(actor: Actor | null) {
  return {
    scopes: actor?.scopes ?? [],
    permissions: (actor?.permissions ?? []).map(({ capability, decision }) => ({
      capability,
      decision,
    })),
    grants: (actor?.grants ?? []).map(
      ({ capability, taskId, runId, status, expiresAt }) => ({
        capability,
        taskId,
        runId,
        status,
        expiresAt,
      }),
    ),
    review_policy: actor?.reviewPolicy ?? null,
  };
}

/** Only allowlisted identifiers and current authority enter durable audit snapshots. */
export async function setIntegrationAudit(
  tx: Transaction,
  operation: ApprovedAgentOperation | TrustedReviewReceipt,
  actor: Actor,
  extra: Record<string, unknown> = {},
) {
  const context = {
    trace_id: operation.trace_id,
    request_id: operation.request_id,
    approval_id: operation.approval_id,
    receipt_id: operation.receipt_id,
    operation_hash: operation.operation_hash,
    source: operation.source,
    controller_id: operation.controller_id,
    member_id: actor.id,
    kind: actor.kind,
    role: actor.role,
    ...permissionSnapshot(actor),
    ...extra,
  };
  await tx.execute(
    sql`select set_config('taff.integration_audit', ${JSON.stringify(context)}, true)`,
  );
}

export function createIntegrationAudit(deps: {
  db: Database;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    action: Action,
    resource?: Resource,
  ): Promise<Actor>;
  loadActor(
    q: Database | Transaction,
    p: Principal,
    w: string,
  ): Promise<Actor | null>;
}) {
  return {
    async searchIntegrationAudit(p: Principal, input: unknown) {
      const query = integrationAuditQuerySchema.parse(input);
      return deps.db.transaction(async (tx) => {
        await deps.requireMember(tx, p, query.workspaceId, "workspace:manage");
        const filters = [eq(activity.workspaceId, query.workspaceId)];
        if (query.receipt_id)
          filters.push(
            sql`${activity.details}->>'receipt_id' = ${query.receipt_id}`,
          );
        if (query.trace_id) filters.push(eq(activity.traceId, query.trace_id));
        if (query.request_id)
          filters.push(
            sql`${activity.details}->>'request_id' = ${query.request_id}`,
          );
        if (query.approval_id)
          filters.push(
            sql`${activity.details}->>'approval_id' = ${query.approval_id}`,
          );
        const rows = await tx
          .select()
          .from(activity)
          .where(and(...filters))
          .orderBy(desc(activity.createdAt), desc(activity.id))
          .limit(201);
        return { entries: rows.slice(0, 200), truncated: rows.length > 200 };
      });
    },
    async explainIntegrationPermission(p: Principal, input: unknown) {
      const query = integrationPermissionQuerySchema.parse(input);
      return deps.db.transaction(async (tx) => {
        await deps.requireMember(tx, p, query.workspaceId, "workspace:manage");
        const [token] = await tx
          .select()
          .from(agentTokens)
          .where(
            and(
              eq(agentTokens.id, query.tokenId),
              eq(agentTokens.workspaceId, query.workspaceId),
            ),
          );
        if (!token) throw new CoreError("not_found", 404);
        const actor = await deps.loadActor(
          tx,
          {
            kind: "agent",
            tokenId: token.id,
            memberId: token.memberId,
            workspaceId: token.workspaceId,
            scopes: [],
          },
          query.workspaceId,
        );
        return {
          adapter: "taff_native",
          token_id: token.id,
          member_id: token.memberId,
          active: actor !== null,
          ...permissionSnapshot(actor),
          // A receipt never grants capabilities or human review authority.
          enforcement:
            "current_native_scopes_capabilities_grants_and_resource_permissions",
          human_review:
            "verified_current_person_membership_and_task_review_permission",
        };
      });
    },
  };
}
