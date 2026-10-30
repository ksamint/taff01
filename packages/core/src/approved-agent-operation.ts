import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  approvedAgentReceipts,
  type Database,
  projects,
  runs,
  type Transaction,
  tasks,
} from "@taff/db";
import {
  type ApprovedAgentOperation,
  approvedAgentEnvelopeSchema,
  approvedAgentPayloadSchema,
  approvedAgentToolSchemas,
  SchemaError,
} from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { CoreError, type Principal, userPrincipal } from "./index";
import { setIntegrationAudit } from "./integration-audit";
import { type Action, type Actor, can, type Resource } from "./permissions";

import type { ControllerMapping } from "./trusted-review";

type Agent = Extract<Principal, { kind: "agent" }>;
export function verifyAgentOperation(
  input: unknown,
  signature: string,
  key: string,
  tokenHash: string,
): ApprovedAgentOperation {
  const envelope = approvedAgentEnvelopeSchema.safeParse(input);
  if (!envelope.success || key.length < 32 || !/^[a-f0-9]{64}$/.test(signature))
    throw new CoreError("unauthorized", 401);
  const bytes = envelope.data.operation_json;
  const expected = createHmac("sha256", key).update(bytes, "utf8").digest();
  if (
    !timingSafeEqual(expected, Buffer.from(signature, "hex")) ||
    createHash("sha256").update(bytes, "utf8").digest("hex") !==
      envelope.data.operation_hash
  )
    throw new CoreError("unauthorized", 401);
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    throw new CoreError("invalid_input", 400);
  }
  const payload = approvedAgentPayloadSchema.safeParse(raw);
  if (!payload.success) throw new CoreError("invalid_input", 400);
  if (payload.data.credential_hash !== tokenHash)
    throw new CoreError("unauthorized", 401);
  return { ...payload.data, operation_hash: envelope.data.operation_hash };
}

export function createApprovedAgentOperation(deps: {
  key?: string;
  resolveAgentWorkspace(p: Agent, workspaceId: string): Promise<Agent>;
  mappings?: ControllerMapping[];
  requireMember?(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  loadActor(
    q: Database | Transaction,
    p: Principal,
    w: string,
  ): Promise<Actor | null>;
  lockTask(tx: Transaction, id: string): Promise<typeof tasks.$inferSelect>;
  currentRunId(
    q: Database | Transaction,
    taskId: string,
  ): Promise<string | undefined>;
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
    p = await deps.resolveAgentWorkspace(p, operation.workspace_id);
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
      const actor = await deps.loadActor(tx, p, p.workspaceId);
      if (!actor) throw new CoreError("forbidden", 403);
      if (operation.tool.startsWith("projects.")) {
        const mappings =
          deps.mappings?.filter(
            (m) =>
              m.controllerId === operation.controller_id &&
              m.workspaceId === operation.workspace_id,
          ) ?? [];
        if (mappings.length !== 1 || !deps.requireMember)
          throw new CoreError("forbidden", 403);
        const mapping = mappings[0];
        for (const userId of [mapping.userId, mapping.verifiedByUserId]) {
          const person = await deps.requireMember(
            tx,
            userPrincipal(userId),
            p.workspaceId,
            "project:manage",
          );
          if (person.kind !== "person") throw new CoreError("forbidden", 403);
        }
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${operation.receipt_id}, 1))`,
      );
      let currentVersion: number | null = null;
      let resource: Extract<Resource, { workspaceId: string }> = {
        workspaceId: p.workspaceId,
        approvedProjectOperation: operation.tool.startsWith("projects."),
      };
      if (operation.tool === "projects.edit") {
        const projectArgs = approvedAgentToolSchemas["projects.edit"].parse(
          operation.arguments,
        );
        const [project] = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, projectArgs.projectId))
          .for("update");
        if (!project || project.workspaceId !== p.workspaceId)
          throw new CoreError("forbidden", 403);
        currentVersion = project.version;
      } else if ("runId" in args) {
        const [candidate] = await tx
          .select()
          .from(runs)
          .where(eq(runs.id, args.runId));
        if (!candidate || candidate.workspaceId !== p.workspaceId)
          throw new CoreError("forbidden", 403);
        const task = await deps.lockTask(tx, candidate.taskId);
        if (task.workspaceId !== p.workspaceId)
          throw new CoreError("forbidden", 403);
        const [run] = await tx
          .select()
          .from(runs)
          .where(eq(runs.id, candidate.id))
          .for("update");
        currentVersion = run.version;
        resource = {
          ...resource,
          taskId: task.id,
          runId: run.id,
          agentId: run.agentId,
          ownerId: task.ownerId,
          workerId: run.agentId,
        };
        if (
          task.workerId !== run.agentId ||
          (operation.tool === "runs.control" &&
            "action" in args &&
            args.action === "resume" &&
            run.pausedBy === "person")
        )
          throw new CoreError("forbidden", 403);
      } else if ("taskId" in args) {
        const task = await deps.lockTask(tx, args.taskId);
        if (task.workspaceId !== p.workspaceId)
          throw new CoreError("forbidden", 403);
        currentVersion = task.version;
        resource = {
          ...resource,
          taskId: task.id,
          runId: await deps.currentRunId(tx, task.id),
          ownerId: task.ownerId,
          workerId: task.workerId,
        };
      }
      const allowed = (action: Action, extra = {}) => {
        if (!can(actor, action, { ...resource, ...extra }))
          throw new CoreError("forbidden", 403);
      };
      // Replays also require current authority, without repeating business mutations.
      switch (operation.tool) {
        case "projects.create":
        case "projects.edit":
          allowed("project:manage");
          break;
        case "tasks.create":
          allowed("task:create", {
            toWorkerId: p.memberId,
            taskId:
              "parentId" in args ? (args.parentId ?? undefined) : undefined,
          });
          break;
        case "tasks.edit":
          if (
            Object.keys(args).some(
              (key) => !["taskId", "version", "dueAt", "status"].includes(key),
            )
          )
            allowed("task:edit");
          if ("ownerId" in args && args.ownerId !== undefined)
            allowed("task:owner");
          if ("dueAt" in args && args.dueAt !== undefined)
            allowed("task:schedule");
          if ("status" in args && args.status !== undefined)
            allowed(args.status === "done" ? "task:review" : "task:status", {
              to: args.status,
            });
          break;
        case "tasks.comments.add":
          allowed("task:comment");
          break;
        case "calendar.set":
          allowed("task:schedule");
          break;
        case "runs.start":
          allowed("run:start");
          break;
        case "runs.control":
          allowed("run:control");
          break;
        case "files.attach":
          allowed("files:attach");
          break;
        case "runs.event":
          allowed("run:submit");
          if ("capability" in args && args.capability)
            allowed("capability:use", { capability: args.capability });
          break;
        case "runs.submit":
          allowed("run:submit");
          if (
            !can(actor, "task:finish", {
              ...resource,
              requestedReview:
                "requestReview" in args ? args.requestReview : undefined,
            })
          )
            allowed("run:request_review");
          break;
      }
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
      if (
        operation.tool === "tasks.create" ||
        operation.tool === "projects.create"
      ) {
        if (operation.expected_version !== null)
          throw new CoreError("invalid_input", 400);
      } else {
        if (operation.expected_version === null)
          throw new CoreError("invalid_input", 400);
        if ("version" in args && args.version !== operation.expected_version)
          throw new CoreError("conflict", 409);
        if (currentVersion !== operation.expected_version)
          throw new CoreError("conflict", 409);
      }
      if (
        Date.parse(operation.expires_at) <= Date.now() ||
        Date.parse(operation.expires_at) > Date.now() + 30 * 60_000
      )
        throw new CoreError("conflict", 409);
      // The original operation enforces its own current scopes and resource permissions.
      await setIntegrationAudit(tx, operation, actor, { token_id: p.tokenId });
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
