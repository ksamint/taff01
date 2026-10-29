import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  agentProfiles,
  type Database,
  runs,
  type Transaction,
  tasks,
  trustedReviewReceipts,
} from "@taff/db";
import {
  type Run,
  type TrustedReviewReceipt,
  trustedReviewReceiptSchema,
} from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { CoreError, type Principal, userPrincipal } from "./index";
import type { Action, Actor, Resource } from "./permissions";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyReviewReceipt(
  input: unknown,
  signature: string,
  key: string,
): TrustedReviewReceipt {
  const parsed = trustedReviewReceiptSchema.safeParse(input);
  if (!parsed.success || key.length < 32 || !/^[a-f0-9]{64}$/.test(signature))
    throw new CoreError("unauthorized", 401);
  // Sign the received envelope, before schema defaults can alter the human decision.
  const expected = createHmac("sha256", key)
    .update(canonicalJson(input))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new CoreError("unauthorized", 401);
  const receipt = parsed.data;
  const { operation_hash: _, ...operation } = receipt;
  if (
    createHash("sha256").update(canonicalJson(operation)).digest("hex") !==
    receipt.operation_hash
  )
    throw new CoreError("invalid_input", 400);
  return receipt;
}

export type ControllerMapping = {
  controllerId: string;
  workspaceId: string;
  userId: string;
  verifiedByUserId: string;
};

export function createTrustedReview(deps: {
  key?: string;
  mappings: ControllerMapping[];
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    action: Action,
    resource?: Resource,
  ): Promise<Actor>;
  review(
    tx: Transaction,
    p: Principal,
    receipt: TrustedReviewReceipt,
  ): Promise<Run>;
}) {
  return async (input: unknown, signature: string): Promise<Run> => {
    const receipt = verifyReviewReceipt(input, signature, deps.key ?? "");
    const mapping = deps.mappings.find(
      (m) =>
        m.controllerId === receipt.controller_id &&
        m.workspaceId === receipt.workspace_id,
    );
    if (!mapping) throw new CoreError("forbidden", 403);
    const principal = userPrincipal(mapping.userId);
    return deps.mutation(principal, async (tx) => {
      await deps.requireMember(
        tx,
        userPrincipal(mapping.verifiedByUserId),
        mapping.workspaceId,
        "workspace:manage",
      );
      await deps.requireMember(
        tx,
        principal,
        mapping.workspaceId,
        "workspace:read",
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${receipt.receipt_id}, 0))`,
      );
      const [run] = await tx
        .select()
        .from(runs)
        .where(eq(runs.id, receipt.run_id));
      if (!run || run.workspaceId !== receipt.workspace_id)
        throw new CoreError("forbidden", 403);
      const [task] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, run.taskId));
      const [profile] = await tx
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, run.agentId));
      await deps.requireMember(
        tx,
        principal,
        mapping.workspaceId,
        "task:review",
        {
          workspaceId: mapping.workspaceId,
          taskId: task.id,
          runId: run.id,
          agentId: run.agentId,
          ownerId: task.ownerId,
          workerId: run.agentId,
          supervisorId: profile?.supervisorId,
        },
      );
      const [prior] = await tx
        .select()
        .from(trustedReviewReceipts)
        .where(eq(trustedReviewReceipts.id, receipt.receipt_id));
      if (prior) {
        if (
          prior.workspaceId !== receipt.workspace_id ||
          prior.operationHash !== receipt.operation_hash
        )
          throw new CoreError("conflict", 409);
        return prior.result as Run;
      }
      if (
        Date.parse(receipt.expires_at) <= Date.now() ||
        Date.parse(receipt.expires_at) > Date.now() + 30 * 60_000
      )
        throw new CoreError("conflict", 409);
      // Existing review code locks the run, checks version and human permissions,
      // and validates every required check and artifact decision in this transaction.
      const result = await deps.review(tx, principal, receipt);
      await tx
        .insert(trustedReviewReceipts)
        .values({
          id: receipt.receipt_id,
          workspaceId: receipt.workspace_id,
          operationHash: receipt.operation_hash,
          result,
        });
      return result;
    });
  };
}
