import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  approvedAgentReceipts,
  type Database,
  runs,
  type Transaction,
  tasks,
} from "@taff/db";
import {
  type ApprovedAgentOperation,
  approvedAgentOperationSchema,
  approvedAgentToolSchemas,
  SchemaError,
} from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import type { Actor } from "./permissions";
import { canonicalJson } from "./trusted-review";

type Agent = Extract<Principal, { kind: "agent" }>;
export function verifyAgentOperation(
  input: unknown,
  signature: string,
  key: string,
  tokenHash: string,
): ApprovedAgentOperation {
  const parsed = approvedAgentOperationSchema.safeParse(input);
  if (!parsed.success || key.length < 32 || !/^[a-f0-9]{64}$/.test(signature))
    throw new CoreError("unauthorized", 401);
  const expected = createHmac("sha256", key)
    .update(canonicalJson(input))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new CoreError("unauthorized", 401);
  const operation = parsed.data;
  const { operation_hash: _, ...payload } = operation;
  if (
    operation.credential_hash !== tokenHash ||
    createHash("sha256").update(canonicalJson(payload)).digest("hex") !==
      operation.operation_hash
  )
    throw new CoreError("unauthorized", 401);
  return operation;
}

export function createApprovedAgentOperation(deps: {
  key?: string;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  loadActor(
    q: Database | Transaction,
    p: Principal,
    w: string,
  ): Promise<Actor | null>;
  lockTask(tx: Transaction, id: string): Promise<typeof tasks.$inferSelect>;
  execute(
    tx: Transaction,
    p: Agent,
    operation: ApprovedAgentOperation,
  ): Promise<unknown>;
}) {
  return async (
    p: Agent,
    input: unknown,
    signature: string,
    tokenHash: string,
    reconcileOnly = false,
  ): Promise<unknown> => {
    const operation = verifyAgentOperation(
      input,
      signature,
      deps.key ?? "",
      tokenHash,
    );
    if (operation.workspace_id !== p.workspaceId)
      throw new CoreError("forbidden", 403);
    let args: ReturnType<
      (typeof approvedAgentToolSchemas)[ApprovedAgentOperation["tool"]]["parse"]
    >;
    try {
      args = approvedAgentToolSchemas[operation.tool].parse(
        operation.arguments,
      );
    } catch (error) {
      if (error instanceof SchemaError)
        throw new CoreError("invalid_input", 400);
      throw error;
    }
    return deps.mutation(p, async (tx) => {
      // loadActor locks/rechecks the original token's current scopes and revocation.
      if (!(await deps.loadActor(tx, p, p.workspaceId)))
        throw new CoreError("forbidden", 403);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${operation.receipt_id}, 1))`,
      );
      const [prior] = await tx
        .select()
        .from(approvedAgentReceipts)
        .where(eq(approvedAgentReceipts.id, operation.receipt_id));
      if (prior) {
        if (
          prior.tokenId !== p.tokenId ||
          prior.workspaceId !== p.workspaceId ||
          prior.operationHash !== operation.operation_hash
        )
          throw new CoreError("conflict", 409);
        return prior.result;
      }
      if (reconcileOnly) throw new CoreError("not_found", 404);
      if (operation.tool === "tasks.create") {
        if (operation.expected_version !== null)
          throw new CoreError("invalid_input", 400);
      } else {
        if (operation.expected_version === null)
          throw new CoreError("invalid_input", 400);
        if ("version" in args && args.version !== operation.expected_version)
          throw new CoreError("conflict", 409);
        let currentVersion: number;
        if ("runId" in args) {
          const [candidate] = await tx
            .select()
            .from(runs)
            .where(eq(runs.id, args.runId));
          if (!candidate || candidate.workspaceId !== p.workspaceId)
            throw new CoreError("forbidden", 403);
          await deps.lockTask(tx, candidate.taskId);
          const [run] = await tx
            .select()
            .from(runs)
            .where(eq(runs.id, candidate.id))
            .for("update");
          currentVersion = run.version;
        } else if ("taskId" in args) {
          const task = await deps.lockTask(tx, args.taskId);
          if (task.workspaceId !== p.workspaceId)
            throw new CoreError("forbidden", 403);
          currentVersion = task.version;
        } else throw new CoreError("invalid_input", 400);
        if (currentVersion !== operation.expected_version)
          throw new CoreError("conflict", 409);
      }
      if (
        Date.parse(operation.expires_at) <= Date.now() ||
        Date.parse(operation.expires_at) > Date.now() + 30 * 60_000
      )
        throw new CoreError("conflict", 409);
      // The original operation enforces its own current scopes and resource permissions.
      const result = await deps.execute(tx, p, operation);
      await tx.insert(approvedAgentReceipts).values({
        id: operation.receipt_id,
        workspaceId: p.workspaceId,
        tokenId: p.tokenId,
        operationHash: operation.operation_hash,
        result,
      });
      return result;
    });
  };
}
