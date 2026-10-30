import type { Database, Transaction } from "@taff/db";
import type { ApprovedAgentOperation } from "@taff/schemas";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { CoreError, userPrincipal } from "./index";
import {
  createIntegrationAudit,
  setIntegrationAudit,
} from "./integration-audit";
import type { Actor } from "./permissions";

describe("integration audit permission snapshots", () => {
  it("excludes private fields from durable context and permission explanations", async () => {
    // loadActor carries complete database rows even though Actor narrows their types.
    const grant = {
      capability: "tasks.write" as const,
      taskId: null,
      runId: null,
      status: "allowed" as const,
      expiresAt: null,
      reason: "private free-text grant reason",
      decidedBy: "internal-decider",
    };
    const permission = {
      capability: "tasks.write" as const,
      decision: "ask" as const,
      agentId: "internal-agent-id",
    };
    const actor: Actor = {
      id: "agent",
      workspaceId: "workspace",
      userId: null,
      name: "Agent",
      kind: "agent",
      role: "member",
      permissions: [permission],
      grants: [grant],
    };
    const operation: ApprovedAgentOperation = {
      version: 1,
      audience: "taff_agent",
      issuer: "twin",
      source: "private_wechat",
      receipt_id: "receipt",
      controller_id: "controller",
      workspace_id: "workspace",
      expires_at: new Date().toISOString(),
      tool: "tasks.create",
      arguments: {},
      expected_version: null,
      credential_hash: "credential-must-stay-private",
      operation_hash: "operation",
    };
    const execute = vi.fn(async (_query: SQL) => []);
    await setIntegrationAudit(
      { execute } as unknown as Transaction,
      operation,
      actor,
    );
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    const context = JSON.parse(String(query.params[0]));
    expect(context.permissions).toEqual([
      { capability: "tasks.write", decision: "ask" },
    ]);
    expect(context.grants).toEqual([
      {
        capability: "tasks.write",
        taskId: null,
        runId: null,
        status: "allowed",
        expiresAt: null,
      },
    ]);
    expect(JSON.stringify(context)).not.toContain(grant.reason);
    expect(JSON.stringify(context)).not.toContain(operation.credential_hash);

    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const tokenId = "22222222-2222-4222-8222-222222222222";
    const token = {
      id: tokenId,
      memberId: actor.id,
      workspaceId,
      hash: "private-token-hash",
    };
    const where = vi.fn(async () => [token]);
    const tx = { select: () => ({ from: () => ({ where }) }) };
    const loadActor = vi.fn(async () => actor as Actor | null);
    const audit = createIntegrationAudit({
      db: {
        transaction: async (run: (tx: unknown) => unknown) => run(tx),
      } as unknown as Database,
      requireMember: vi.fn(async () => actor),
      loadActor,
    });
    const principal = userPrincipal("admin");
    const input = { workspaceId, tokenId };
    const explanation = await audit.explainIntegrationPermission(
      principal,
      input,
    );
    expect(explanation).toMatchObject({
      active: true,
      permissions: context.permissions,
      grants: context.grants,
    });
    expect(JSON.stringify(explanation)).not.toContain(grant.reason);
    expect(JSON.stringify(explanation)).not.toContain(permission.agentId);
    expect(JSON.stringify(explanation)).not.toContain(token.hash);
    expect(loadActor).toHaveBeenCalledWith(
      tx,
      { kind: "agent", tokenId, memberId: actor.id, workspaceId, scopes: [] },
      workspaceId,
    );
    // Token revocation or loss of membership must discard previous authority.
    loadActor.mockResolvedValueOnce(null);
    await expect(
      audit.explainIntegrationPermission(principal, input),
    ).resolves.toMatchObject({
      active: false,
      scopes: [],
      permissions: [],
      grants: [],
      review_policy: null,
    });
  });

  it("rechecks denied admin authority before every query", async () => {
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const principal = userPrincipal("admin");
    const denied = new CoreError("forbidden", 403);
    const select = vi.fn();
    const tx = { select };
    const requireMember = vi.fn(async () => {
      throw denied;
    });
    const loadActor = vi.fn(async () => null);
    const audit = createIntegrationAudit({
      db: {
        transaction: async (run: (tx: unknown) => unknown) => run(tx),
      } as unknown as Database,
      requireMember,
      loadActor,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        audit.searchIntegrationAudit(principal, { workspaceId }),
      ).rejects.toBe(denied);
      await expect(
        audit.explainIntegrationPermission(principal, {
          workspaceId,
          tokenId: workspaceId,
        }),
      ).rejects.toBe(denied);
    }
    expect(requireMember).toHaveBeenCalledTimes(4);
    expect(requireMember).toHaveBeenCalledWith(
      tx,
      principal,
      workspaceId,
      "workspace:manage",
    );
    expect(select).not.toHaveBeenCalled();
    expect(loadActor).not.toHaveBeenCalled();
  });
});
