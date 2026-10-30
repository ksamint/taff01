import { createHash, createHmac, randomUUID } from "node:crypto";
import { projects, type Transaction } from "@taff/db";
import { describe, expect, it, vi } from "vitest";
import { createApprovedAgentOperation } from "./approved-agent-operation";
import type { Principal } from "./index";
import type { Actor } from "./permissions";

const workspaceId = randomUUID(),
  projectId = randomUUID(),
  tokenId = randomUUID(),
  memberId = randomUUID();
const key = "project-test-signing-key-at-least-32-characters",
  tokenHash = "a".repeat(64);
const principal: Extract<Principal, { kind: "agent" }> = {
  kind: "agent",
  workspaceId,
  tokenId,
  memberId,
  scopes: ["tasks:read", "tasks:write"],
};
function fixture() {
  const state = {
    actor: {
      ...principal,
      id: memberId,
      kind: "agent",
      role: "member",
      userId: null,
      name: "Agent",
      scopes: ["tasks:read", "tasks:write"],
      permissions: [{ capability: "projects.manage", decision: "allow" }],
    } as Actor | null,
    version: 1,
    prior: null as unknown,
    mappings: [
      {
        controllerId: "controller",
        workspaceId,
        userId: randomUUID(),
        verifiedByUserId: randomUUID(),
      },
    ],
  };
  const execute = vi.fn(
    async (_tx: Transaction, _p: Principal, _operation: unknown) => ({
      id: projectId,
      version: 2,
    }),
  );
  const member = vi.fn(
    async () => ({ kind: "person", role: "admin" }) as Actor,
  );
  const saved = vi.fn(async () => {});
  const tx = {
    execute: vi.fn(async () => {}),
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows =
            table === projects
              ? [{ id: projectId, workspaceId, version: state.version }]
              : state.prior
                ? [state.prior]
                : [];
          return Object.assign(Promise.resolve(rows), {
            for: async () => rows,
          });
        },
      }),
    }),
    insert: () => ({ values: saved }),
  } as unknown as Transaction;
  const apply = createApprovedAgentOperation({
    key,
    resolveAgentWorkspace: async (p, workspaceId) => {
      if (p.workspaceId !== workspaceId) throw new Error("forbidden");
      return p;
    },
    mappings: state.mappings,
    requireMember: member,
    mutation: async (_p, fn) => fn(tx),
    loadActor: async () => state.actor,
    execute,
    lockTask: vi.fn(),
    currentRunId: vi.fn(),
  });
  const sign = (
    tool = "projects.edit",
    args: Record<string, unknown> = {
      projectId,
      version: 1,
      deliveryProgress: 50,
    },
    expected: number | null = 1,
  ) => {
    const operation_json = JSON.stringify({
      version: 1,
      audience: "taff_agent",
      issuer: "twin",
      source: "private_wechat",
      receipt_id: randomUUID(),
      controller_id: "controller",
      workspace_id: workspaceId,
      expires_at: new Date(Date.now() + 60000).toISOString(),
      tool,
      arguments: args,
      expected_version: expected,
      credential_hash: tokenHash,
    });
    return [
      principal,
      {
        operation_json,
        operation_hash: createHash("sha256")
          .update(operation_json)
          .digest("hex"),
      },
      createHmac("sha256", key).update(operation_json).digest("hex"),
      tokenHash,
    ] as const;
  };
  return { state, execute, member, saved, apply, sign };
}
describe("signed project operation fences", () => {
  it("locks current version, checks both current human authorities, and executes as original agent", async () => {
    const f = fixture();
    await expect(f.apply(...f.sign())).resolves.toEqual({
      id: projectId,
      version: 2,
    });
    expect(f.member).toHaveBeenCalledTimes(2);
    expect(f.execute.mock.calls[0][1].kind).toBe("agent");
    expect(f.saved).toHaveBeenCalledOnce();
  });
  it("creates only with null expected version", async () => {
    const f = fixture();
    await f.apply(...f.sign("projects.create", { name: "Project" }, null));
    expect(f.execute).toHaveBeenCalledOnce();
    await expect(
      f.apply(...f.sign("projects.create", { name: "Project" }, 1)),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it.each([
    "mapping",
    "duplicate",
    "member",
    "token",
    "permission",
    "scope",
    "version",
  ] as const)(
    "rejects revoked/stale %s before execution and reconciliation",
    async (change) => {
      const f = fixture();
      if (change === "mapping") f.state.mappings.length = 0;
      if (change === "duplicate")
        f.state.mappings.push({ ...f.state.mappings[0] });
      if (change === "member")
        f.member.mockRejectedValue(new Error("revoked human authority"));
      if (change === "token") f.state.actor = null;
      if (change === "permission")
        f.state.actor!.permissions = [
          { capability: "projects.manage", decision: "deny" },
        ];
      if (change === "scope") f.state.actor!.scopes = ["tasks:read"];
      if (change === "version") f.state.version = 2;
      await expect(f.apply(...f.sign())).rejects.toThrow();
      expect(f.execute).not.toHaveBeenCalled();
      // Reconciliation rechecks authority as well; stale version alone is ignored only for an existing exact receipt.
      if (change !== "version")
        await expect(f.apply(...f.sign(), true)).rejects.toThrow();
    },
  );
  it("never executes a reconcile-only request without a durable receipt", async () => {
    const f = fixture();
    await expect(f.apply(...f.sign(), true)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
});

it("does not disclose another workspace's durable approval receipt", async () => {
  const f = fixture();
  const args = f.sign();
  f.state.prior = {
    tokenId,
    workspaceId: randomUUID(),
    operationHash: args[1].operation_hash,
    result: { secret: true },
  };
  await expect(f.apply(...args, true)).rejects.toMatchObject({
    code: "conflict",
  });
  expect(f.execute).not.toHaveBeenCalled();
});
it("rechecks read-only scope even for an existing approval receipt", async () => {
  const f = fixture();
  const args = f.sign();
  f.state.prior = {
    tokenId,
    workspaceId,
    operationHash: args[1].operation_hash,
    result: { id: projectId },
  };
  f.state.actor!.scopes = ["tasks:read"];
  await expect(f.apply(...args)).rejects.toMatchObject({ code: "forbidden" });
  await expect(f.apply(...args, true)).rejects.toMatchObject({
    code: "forbidden",
  });
  expect(f.execute).not.toHaveBeenCalled();
});
