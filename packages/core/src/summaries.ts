import { randomBytes, randomUUID } from "node:crypto";
import {
  audienceRecipients,
  audienceTags,
  type Database,
  dailySummaries,
  members,
  projectAudienceTags,
  projects,
  runs,
  summaryShares,
  type Transaction,
  tasks,
  workspaces,
} from "@taff/db";
import {
  type AudienceRecipient,
  type AudienceRecipientInput,
  type AudienceRecipientUpdate,
  type AudienceTag,
  type AudienceTagInput,
  type AudienceTagUpdate,
  audienceRecipientInputSchema,
  audienceRecipientUpdateSchema,
  audienceTagInputSchema,
  audienceTagUpdateSchema,
  canonicalCalendarTimeZone,
  type DailySummary,
  type DailySummaryList,
  type DailySummaryListQuery,
  type DueSummaryJobs,
  dailySummaryListQuerySchema,
  dailySummarySnapshotSchema,
  type IssuedSummaryShare,
  idSchema,
  type ProjectAudienceTags,
  type ProjectAudienceTagsInput,
  projectAudienceTagsInputSchema,
  SchemaError,
  type SharedSummary,
  type SummaryJobCursor,
  type SummaryJobResult,
  type SummaryPreview,
  type SummaryPreviewInput,
  type SummaryShare,
  type SummaryShareInput,
  summaryJobCursorSchema,
  summaryJobSchema,
  summaryPreviewInputSchema,
  summaryShareInputSchema,
  summaryShareTokenSchema,
  summaryWatermarkSchema,
} from "@taff/schemas";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { CoreError, hashToken, type Principal } from "./index";
import {
  digestInstantForDay,
  digestLocalDate,
  nextDigestInstant,
} from "./notifications-time";
import { type Action, type Actor, can, type Resource } from "./permissions";
import type { PlanModelInput } from "./plan-model";
import {
  buildDailySummary,
  type SummarySourceProject,
  summaryContentHash,
  summaryWatermark,
} from "./summary-model";
import { createSummaryRenderOperations } from "./summary-renders";

type PlanSource = (
  actor: Actor,
  project: typeof projects.$inferSelect,
  timeZone: string,
  options?: { finance?: boolean },
) => Promise<{
  input: PlanModelInput;
  rows: { task: typeof tasks.$inferSelect }[];
}>;
type Dependencies = {
  db: Database;
  tokenPepper: string;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  planSource: PlanSource;
  /** Injectable clock for expiry and scheduling tests. */
  now?: () => Date;
};

const SHARE_DAYS_DEFAULT = 7;
const DAY_MS = 86_400_000;
const LIST_LIMIT = 31;
/** The job's own identity; planSource needs an actor, finance is explicit. */
const SYSTEM_ACTOR_ID = "system:daily-summary";

function parse<T>(schema: { parse(v: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
function uniqueViolation(error: unknown): boolean {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : error;
  return (
    !!cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "23505"
  );
}
const iso = (value: Date) => value.toISOString();
const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

type TagRow = typeof audienceTags.$inferSelect;
type RecipientRow = typeof audienceRecipients.$inferSelect;
type SummaryRow = typeof dailySummaries.$inferSelect;
type ShareRow = typeof summaryShares.$inferSelect;

function tagDTO(
  row: TagRow,
  counts: { projects: number; recipients: number },
): AudienceTag {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as AudienceTag["kind"],
    org: row.org,
    label: row.label,
    archived: row.archivedAt !== null,
    version: row.version,
    projectCount: counts.projects,
    recipientCount: counts.recipients,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
function recipientDTO(row: RecipientRow): AudienceRecipient {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    tagId: row.tagId,
    name: row.name,
    contactId: row.contactId,
    userId: row.userId,
    locale: row.locale as AudienceRecipient["locale"],
    timeZone: row.timeZone,
    deliverAt: row.deliverAt,
    includeFinance: row.includeFinance,
    showPeople: row.showPeople,
    enabled: row.enabled,
    nextDueAt: iso(row.nextDueAt),
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
function summaryDTO(row: SummaryRow): DailySummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    tagId: row.tagId,
    recipientId: row.recipientId,
    localDate: row.localDate,
    timeZone: row.timeZone,
    locale: row.locale as DailySummary["locale"],
    snapshot: dailySummarySnapshotSchema.parse(row.snapshot),
    watermark: summaryWatermarkSchema.parse(row.watermark),
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
  };
}
function shareStatus(row: ShareRow, now: Date): SummaryShare["status"] {
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "active";
}
function shareDTO(row: ShareRow, now: Date): SummaryShare {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    summaryId: row.summaryId,
    createdBy: row.createdBy,
    status: shareStatus(row, now),
    expiresAt: iso(row.expiresAt),
    revokedAt: row.revokedAt ? iso(row.revokedAt) : null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt ? iso(row.lastViewedAt) : null,
    createdAt: iso(row.createdAt),
  };
}

export function createSummaryOperations({
  db,
  tokenPepper,
  mutation,
  requireMember,
  planSource,
  now: clock = () => new Date(),
}: Dependencies) {
  async function readTag(q: Database | Transaction, id: string, lock = false) {
    parse(idSchema, id);
    const query = q.select().from(audienceTags).where(eq(audienceTags.id, id));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new CoreError("not_found", 404);
    return row;
  }
  async function readRecipient(
    q: Database | Transaction,
    id: string,
    lock = false,
  ) {
    parse(idSchema, id);
    const query = q
      .select()
      .from(audienceRecipients)
      .where(eq(audienceRecipients.id, id));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new CoreError("not_found", 404);
    return row;
  }
  async function readSummary(q: Database | Transaction, id: string) {
    parse(idSchema, id);
    const [found] = await q
      .select({ summary: dailySummaries, userId: audienceRecipients.userId })
      .from(dailySummaries)
      .innerJoin(
        audienceRecipients,
        and(
          eq(audienceRecipients.workspaceId, dailySummaries.workspaceId),
          eq(audienceRecipients.id, dailySummaries.recipientId),
        ),
      )
      .where(eq(dailySummaries.id, id));
    if (!found) throw new CoreError("not_found", 404);
    return found;
  }
  async function tagCounts(q: Database | Transaction, ids: string[]) {
    const out = new Map(ids.map((id) => [id, { projects: 0, recipients: 0 }]));
    if (!ids.length) return out;
    const projectRows = await q
      .select({ tagId: projectAudienceTags.tagId, n: count() })
      .from(projectAudienceTags)
      .where(inArray(projectAudienceTags.tagId, ids))
      .groupBy(projectAudienceTags.tagId);
    const recipientRows = await q
      .select({ tagId: audienceRecipients.tagId, n: count() })
      .from(audienceRecipients)
      .where(inArray(audienceRecipients.tagId, ids))
      .groupBy(audienceRecipients.tagId);
    for (const row of projectRows) out.get(row.tagId)!.projects = row.n;
    for (const row of recipientRows) out.get(row.tagId)!.recipients = row.n;
    return out;
  }
  /** A linked account must be a person of the workspace (guests allowed). */
  async function requireLinkedPerson(
    q: Transaction,
    workspaceId: string,
    userId: string | null | undefined,
  ) {
    if (!userId) return;
    const [member] = await q
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.workspaceId, workspaceId),
          eq(members.userId, userId),
          eq(members.kind, "person"),
        ),
      );
    if (!member) throw new CoreError("invalid_input", 400);
  }

  // ---- Audience tags --------------------------------------------------

  async function listAudienceTags(
    p: Principal,
    workspaceId: string,
  ): Promise<AudienceTag[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, p, workspaceId, "audience:read");
    const rows = await db
      .select()
      .from(audienceTags)
      .where(eq(audienceTags.workspaceId, workspaceId))
      .orderBy(
        sql`${audienceTags.archivedAt} IS NOT NULL`,
        sql`lower(${audienceTags.org})`,
        audienceTags.id,
      );
    const counts = await tagCounts(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => tagDTO(row, counts.get(row.id)!));
  }
  async function createAudienceTag(
    p: Principal,
    workspaceId: string,
    input: AudienceTagInput,
  ): Promise<AudienceTag> {
    parse(idSchema, workspaceId);
    const body = parse(audienceTagInputSchema, input);
    try {
      return await mutation(p, async (tx) => {
        await requireMember(tx, p, workspaceId, "audience:manage");
        const [row] = await tx
          .insert(audienceTags)
          .values({
            workspaceId,
            kind: body.kind ?? "shareholder",
            org: body.org,
            label: body.label ?? "",
          })
          .returning();
        return tagDTO(row, { projects: 0, recipients: 0 });
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new CoreError("conflict", 409);
      throw error;
    }
  }
  async function updateAudienceTag(
    p: Principal,
    tagId: string,
    input: AudienceTagUpdate,
  ): Promise<AudienceTag> {
    const body = parse(audienceTagUpdateSchema, input);
    const current = await readTag(db, tagId);
    try {
      return await mutation(p, async (tx) => {
        await requireMember(tx, p, current.workspaceId, "audience:manage");
        const row = await readTag(tx, tagId, true);
        if (row.version !== body.version) throw new CoreError("conflict", 409);
        const [updated] = await tx
          .update(audienceTags)
          .set({
            org: body.org ?? row.org,
            label: body.label ?? row.label,
            archivedAt:
              body.archived === undefined
                ? row.archivedAt
                : body.archived
                  ? (row.archivedAt ?? clock())
                  : null,
            version: row.version + 1,
            updatedAt: clock(),
          })
          .where(eq(audienceTags.id, row.id))
          .returning();
        const counts = await tagCounts(tx, [row.id]);
        return tagDTO(updated, counts.get(row.id)!);
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new CoreError("conflict", 409);
      throw error;
    }
  }

  // ---- Recipients -----------------------------------------------------

  async function listAudienceRecipients(
    p: Principal,
    tagId: string,
  ): Promise<AudienceRecipient[]> {
    const tag = await readTag(db, tagId);
    await requireMember(db, p, tag.workspaceId, "audience:manage");
    const rows = await db
      .select()
      .from(audienceRecipients)
      .where(eq(audienceRecipients.tagId, tag.id))
      .orderBy(sql`lower(${audienceRecipients.name})`, audienceRecipients.id);
    return rows.map(recipientDTO);
  }
  async function createAudienceRecipient(
    p: Principal,
    tagId: string,
    input: AudienceRecipientInput,
  ): Promise<AudienceRecipient> {
    const body = parse(audienceRecipientInputSchema, input);
    const tag = await readTag(db, tagId);
    try {
      return await mutation(p, async (tx) => {
        await requireMember(tx, p, tag.workspaceId, "audience:manage");
        const locked = await readTag(tx, tagId, true);
        if (locked.archivedAt) throw new CoreError("conflict", 409);
        await requireLinkedPerson(tx, tag.workspaceId, body.userId);
        const zone = canonicalCalendarTimeZone(body.timeZone);
        const [row] = await tx
          .insert(audienceRecipients)
          .values({
            workspaceId: tag.workspaceId,
            tagId: tag.id,
            name: body.name,
            contactId: body.contactId ?? null,
            userId: body.userId ?? null,
            locale: body.locale,
            timeZone: zone,
            deliverAt: body.deliverAt,
            includeFinance: body.includeFinance ?? false,
            showPeople: body.showPeople ?? true,
            nextDueAt: nextDigestInstant(clock(), body.deliverAt, zone),
          })
          .returning();
        return recipientDTO(row);
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new CoreError("conflict", 409);
      if (
        error instanceof Error &&
        "cause" in error &&
        (error.cause as { code?: string })?.code === "23503"
      )
        throw new CoreError("invalid_input", 400);
      throw error;
    }
  }
  async function updateAudienceRecipient(
    p: Principal,
    recipientId: string,
    input: AudienceRecipientUpdate,
  ): Promise<AudienceRecipient> {
    const body = parse(audienceRecipientUpdateSchema, input);
    const current = await readRecipient(db, recipientId);
    try {
      return await mutation(p, async (tx) => {
        await requireMember(tx, p, current.workspaceId, "audience:manage");
        const row = await readRecipient(tx, recipientId, true);
        if (row.version !== body.version) throw new CoreError("conflict", 409);
        if (body.userId !== undefined)
          await requireLinkedPerson(tx, row.workspaceId, body.userId);
        const zone =
          body.timeZone === undefined
            ? row.timeZone
            : canonicalCalendarTimeZone(body.timeZone);
        const deliverAt = body.deliverAt ?? row.deliverAt;
        const enabled = body.enabled ?? row.enabled;
        const reschedule =
          zone !== row.timeZone ||
          deliverAt !== row.deliverAt ||
          (enabled && !row.enabled);
        const [updated] = await tx
          .update(audienceRecipients)
          .set({
            name: body.name ?? row.name,
            contactId:
              body.contactId === undefined ? row.contactId : body.contactId,
            userId: body.userId === undefined ? row.userId : body.userId,
            locale: body.locale ?? row.locale,
            timeZone: zone,
            deliverAt,
            includeFinance: body.includeFinance ?? row.includeFinance,
            showPeople: body.showPeople ?? row.showPeople,
            enabled,
            nextDueAt: reschedule
              ? nextDigestInstant(clock(), deliverAt, zone)
              : row.nextDueAt,
            version: row.version + 1,
            updatedAt: clock(),
          })
          .where(eq(audienceRecipients.id, row.id))
          .returning();
        return recipientDTO(updated);
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new CoreError("conflict", 409);
      if (
        error instanceof Error &&
        "cause" in error &&
        (error.cause as { code?: string })?.code === "23503"
      )
        throw new CoreError("invalid_input", 400);
      throw error;
    }
  }

  // ---- Project tags ---------------------------------------------------

  async function projectTagRefs(
    q: Database | Transaction,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectAudienceTags> {
    const rows = await q
      .select({
        id: audienceTags.id,
        kind: audienceTags.kind,
        org: audienceTags.org,
        label: audienceTags.label,
      })
      .from(projectAudienceTags)
      .innerJoin(
        audienceTags,
        and(
          eq(audienceTags.workspaceId, projectAudienceTags.workspaceId),
          eq(audienceTags.id, projectAudienceTags.tagId),
        ),
      )
      .where(
        and(
          eq(projectAudienceTags.workspaceId, workspaceId),
          eq(projectAudienceTags.projectId, projectId),
        ),
      )
      .orderBy(sql`lower(${audienceTags.org})`, audienceTags.id);
    return {
      projectId,
      tags: rows.map((row) => ({
        ...row,
        kind: row.kind as AudienceTag["kind"],
      })),
    };
  }
  async function readProject(id: string) {
    parse(idSchema, id);
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new CoreError("not_found", 404);
    return row;
  }
  async function listProjectAudienceTags(
    p: Principal,
    projectId: string,
  ): Promise<ProjectAudienceTags> {
    const project = await readProject(projectId);
    await requireMember(db, p, project.workspaceId, "audience:read");
    return projectTagRefs(db, project.workspaceId, project.id);
  }
  /** Replaces the project's tag set; already-linked archived tags may stay. */
  async function setProjectAudienceTags(
    p: Principal,
    projectId: string,
    input: ProjectAudienceTagsInput,
  ): Promise<ProjectAudienceTags> {
    const body = parse(projectAudienceTagsInputSchema, input);
    const project = await readProject(projectId);
    const w = project.workspaceId;
    return mutation(p, async (tx) => {
      const actor = await requireMember(tx, p, w, "audience:manage");
      await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, project.id))
        .for("update");
      const linked = await tx
        .select({
          id: projectAudienceTags.id,
          tagId: projectAudienceTags.tagId,
        })
        .from(projectAudienceTags)
        .where(
          and(
            eq(projectAudienceTags.workspaceId, w),
            eq(projectAudienceTags.projectId, project.id),
          ),
        );
      const have = new Set(linked.map((row) => row.tagId));
      const added = body.tagIds.filter((id) => !have.has(id));
      if (added.length) {
        const valid = await tx
          .select({ id: audienceTags.id })
          .from(audienceTags)
          .where(
            and(
              eq(audienceTags.workspaceId, w),
              inArray(audienceTags.id, added),
              isNull(audienceTags.archivedAt),
            ),
          );
        if (valid.length !== added.length)
          throw new CoreError("invalid_input", 400);
      }
      const removed = linked.filter((row) => !body.tagIds.includes(row.tagId));
      if (removed.length)
        await tx.delete(projectAudienceTags).where(
          inArray(
            projectAudienceTags.id,
            removed.map((row) => row.id),
          ),
        );
      if (added.length)
        await tx.insert(projectAudienceTags).values(
          added.map((tagId) => ({
            workspaceId: w,
            projectId: project.id,
            tagId,
            createdBy: actor.id,
          })),
        );
      return projectTagRefs(tx, w, project.id);
    });
  }

  // ---- Building a snapshot -------------------------------------------

  async function buildSnapshot(
    recipient: RecipientRow,
    tag: TagRow,
    day: string,
  ) {
    const w = recipient.workspaceId;
    const zone = recipient.timeZone;
    const [workspace] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, w));
    const projectRows = await db
      .select({ project: projects })
      .from(projectAudienceTags)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectAudienceTags.workspaceId),
          eq(projects.id, projectAudienceTags.projectId),
        ),
      )
      .where(
        and(
          eq(projectAudienceTags.workspaceId, w),
          eq(projectAudienceTags.tagId, tag.id),
          eq(projects.archived, false),
        ),
      )
      .orderBy(projects.name, projects.id)
      .limit(101);
    const people = new Map(
      (
        await db
          .select({ id: members.id, name: members.name })
          .from(members)
          .where(eq(members.workspaceId, w))
      ).map((row) => [row.id, row.name]),
    );
    const actor: Actor = {
      id: SYSTEM_ACTOR_ID,
      workspaceId: w,
      userId: null,
      name: "Daily summary",
      kind: "person",
      role: "member",
    };
    const start = digestInstantForDay(day, "00:00", zone);
    const end = digestInstantForDay(nextDay(day), "00:00", zone);
    const sources: SummarySourceProject[] = [];
    for (const { project } of projectRows) {
      const { input, rows } = await planSource(actor, project, zone, {
        finance: recipient.includeFinance,
      });
      const blocked = new Set(
        input.tasks.filter((task) => task.blocked).map((task) => task.id),
      );
      const ids = rows.map((row) => row.task.id);
      const [agentRuns] = ids.length
        ? await db
            .select({
              completedToday: sql<number>`count(*) FILTER (WHERE ${runs.finishedAt} >= ${start.toISOString()}::timestamptz AND ${runs.finishedAt} < ${end.toISOString()}::timestamptz)::int`,
              pendingReview: sql<number>`count(*) FILTER (WHERE ${runs.status} = 'needs_review')::int`,
            })
            .from(runs)
            .where(and(eq(runs.workspaceId, w), inArray(runs.taskId, ids)))
        : [{ completedToday: 0, pendingReview: 0 }];
      sources.push({
        projectId: project.id,
        name: project.name,
        stage: project.stage,
        leadName: project.leadId ? (people.get(project.leadId) ?? null) : null,
        dueAt: project.dueAt ? iso(project.dueAt) : null,
        deliveryProgress: project.deliveryProgress,
        plan: { ...input, today: day },
        tasks: rows.map(({ task }) => ({
          taskId: task.id,
          number: task.number,
          title: task.title,
          status: task.status,
          ownerName: people.get(task.ownerId) ?? null,
          dueAt: task.dueAt ? iso(task.dueAt) : null,
          dueDate: task.dueAt ? digestLocalDate(task.dueAt, zone) : null,
          changedOn: digestLocalDate(task.updatedAt, zone),
          blocked: blocked.has(task.id),
        })),
        agentRuns: {
          completedToday: Number(agentRuns?.completedToday ?? 0),
          pendingReview: Number(agentRuns?.pendingReview ?? 0),
        },
      });
    }
    return buildDailySummary({
      localDate: day,
      timeZone: zone,
      workspaceName: workspace?.name ?? "",
      tag: {
        kind: tag.kind as AudienceTag["kind"],
        org: tag.org,
        label: tag.label,
      },
      recipient: {
        name: recipient.name,
        includeFinance: recipient.includeFinance,
        showPeople: recipient.showPeople,
      },
      projects: sources,
    });
  }

  // ---- Reading summaries ---------------------------------------------

  async function listDailySummaries(
    p: Principal,
    workspaceId: string,
    query: DailySummaryListQuery = {},
  ): Promise<DailySummaryList> {
    parse(idSchema, workspaceId);
    const filter = parse(dailySummaryListQuerySchema, query);
    const actor = await requireMember(
      db,
      p,
      workspaceId,
      p.kind === "agent" ? "summary:read" : "workspace:read",
    );
    const admin = can(actor, "summary:read", { workspaceId });
    if (
      !admin &&
      !can(actor, "summary:read", {
        workspaceId,
        recipientUserId: actor.userId,
      })
    )
      throw new CoreError("forbidden", 403);
    const rows = await db
      .select({ summary: dailySummaries, userId: audienceRecipients.userId })
      .from(dailySummaries)
      .innerJoin(
        audienceRecipients,
        and(
          eq(audienceRecipients.workspaceId, dailySummaries.workspaceId),
          eq(audienceRecipients.id, dailySummaries.recipientId),
        ),
      )
      .where(
        and(
          eq(dailySummaries.workspaceId, workspaceId),
          filter.tagId ? eq(dailySummaries.tagId, filter.tagId) : undefined,
          filter.recipientId
            ? eq(dailySummaries.recipientId, filter.recipientId)
            : undefined,
          admin ? undefined : eq(audienceRecipients.userId, actor.userId!),
        ),
      )
      .orderBy(
        desc(dailySummaries.localDate),
        desc(dailySummaries.createdAt),
        dailySummaries.id,
      )
      .limit(LIST_LIMIT + 1);
    const visible = rows.filter((row) =>
      can(actor, "summary:read", {
        workspaceId,
        recipientUserId: row.userId,
      }),
    );
    return {
      items: visible.slice(0, LIST_LIMIT).map((row) => summaryDTO(row.summary)),
      truncated: rows.length > LIST_LIMIT,
    };
  }
  async function getDailySummary(
    p: Principal,
    summaryId: string,
  ): Promise<DailySummary> {
    const found = await readSummary(db, summaryId);
    await requireMember(db, p, found.summary.workspaceId, "summary:read", {
      workspaceId: found.summary.workspaceId,
      recipientUserId: found.userId,
    });
    return summaryDTO(found.summary);
  }
  async function previewDailySummary(
    p: Principal,
    input: SummaryPreviewInput,
  ): Promise<SummaryPreview> {
    const body = parse(summaryPreviewInputSchema, input);
    const recipient = await readRecipient(db, body.recipientId);
    await requireMember(db, p, recipient.workspaceId, "summary:preview");
    const tag = await readTag(db, recipient.tagId);
    const day = body.localDate ?? digestLocalDate(clock(), recipient.timeZone);
    const snapshot = await buildSnapshot(recipient, tag, day);
    const contentHash = summaryContentHash(snapshot);
    return {
      recipientId: recipient.id,
      localDate: day,
      timeZone: recipient.timeZone,
      locale: recipient.locale as SummaryPreview["locale"],
      snapshot,
      watermark: summaryWatermark(snapshot, null, contentHash),
      contentHash,
    };
  }

  // ---- Share links ---------------------------------------------------

  async function createSummaryShare(
    p: Principal,
    summaryId: string,
    input: SummaryShareInput = {},
  ): Promise<IssuedSummaryShare> {
    const body = parse(summaryShareInputSchema, input);
    const found = await readSummary(db, summaryId);
    const w = found.summary.workspaceId;
    return mutation(p, async (tx) => {
      const actor = await requireMember(tx, p, w, "summary:share");
      const token = `tsum_${randomBytes(32).toString("base64url")}`;
      const now = clock();
      const [row] = await tx
        .insert(summaryShares)
        .values({
          workspaceId: w,
          summaryId: found.summary.id,
          tokenHash: hashToken(token, tokenPepper),
          createdBy: actor.id,
          createdAt: now,
          expiresAt: new Date(
            now.getTime() + (body.expiresInDays ?? SHARE_DAYS_DEFAULT) * DAY_MS,
          ),
        })
        .returning();
      return { ...shareDTO(row, now), token };
    });
  }
  async function listSummaryShares(
    p: Principal,
    summaryId: string,
  ): Promise<SummaryShare[]> {
    const found = await readSummary(db, summaryId);
    await requireMember(db, p, found.summary.workspaceId, "summary:share");
    const rows = await db
      .select()
      .from(summaryShares)
      .where(
        and(
          eq(summaryShares.workspaceId, found.summary.workspaceId),
          eq(summaryShares.summaryId, found.summary.id),
        ),
      )
      .orderBy(desc(summaryShares.createdAt), summaryShares.id);
    const now = clock();
    return rows.map((row) => shareDTO(row, now));
  }
  async function revokeSummaryShare(
    p: Principal,
    shareId: string,
  ): Promise<SummaryShare> {
    parse(idSchema, shareId);
    const [current] = await db
      .select()
      .from(summaryShares)
      .where(eq(summaryShares.id, shareId));
    if (!current) throw new CoreError("not_found", 404);
    return mutation(p, async (tx) => {
      const actor = await requireMember(
        tx,
        p,
        current.workspaceId,
        "summary:revoke",
      );
      const [row] = await tx
        .select()
        .from(summaryShares)
        .where(eq(summaryShares.id, shareId))
        .for("update");
      if (row.revokedAt) return shareDTO(row, clock());
      const [updated] = await tx
        .update(summaryShares)
        .set({ revokedAt: clock(), revokedBy: actor.id })
        .where(eq(summaryShares.id, row.id))
        .returning();
      return shareDTO(updated, clock());
    });
  }
  /**
   * Public read by token. Unknown, malformed, expired and revoked tokens, a
   * disabled recipient and an archived tag or workspace all answer not_found,
   * so a caller learns nothing beyond "no such link".
   */
  async function readSharedSummary(token: string): Promise<SharedSummary> {
    const parsed = summaryShareTokenSchema.safeParse(token);
    if (!parsed.success) throw new CoreError("not_found", 404);
    const tokenHash = hashToken(parsed.data, tokenPepper);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id','system:summary-share',true)`,
      );
      const now = clock();
      const [found] = await tx
        .select({ share: summaryShares, summary: dailySummaries })
        .from(summaryShares)
        .innerJoin(
          dailySummaries,
          and(
            eq(dailySummaries.workspaceId, summaryShares.workspaceId),
            eq(dailySummaries.id, summaryShares.summaryId),
          ),
        )
        .innerJoin(
          audienceRecipients,
          and(
            eq(audienceRecipients.workspaceId, dailySummaries.workspaceId),
            eq(audienceRecipients.id, dailySummaries.recipientId),
          ),
        )
        .innerJoin(
          audienceTags,
          and(
            eq(audienceTags.workspaceId, dailySummaries.workspaceId),
            eq(audienceTags.id, dailySummaries.tagId),
          ),
        )
        .innerJoin(workspaces, eq(workspaces.id, dailySummaries.workspaceId))
        .where(
          and(
            eq(summaryShares.tokenHash, tokenHash),
            isNull(summaryShares.revokedAt),
            gt(summaryShares.expiresAt, now),
            eq(audienceRecipients.enabled, true),
            isNull(audienceTags.archivedAt),
            isNull(workspaces.archivedAt),
          ),
        )
        .for("update", { of: summaryShares });
      if (!found) throw new CoreError("not_found", 404);
      await tx
        .update(summaryShares)
        .set({
          viewCount: sql`${summaryShares.viewCount} + 1`,
          lastViewedAt: now,
        })
        .where(eq(summaryShares.id, found.share.id));
      const summary = summaryDTO(found.summary);
      return {
        localDate: summary.localDate,
        timeZone: summary.timeZone,
        locale: summary.locale,
        snapshot: summary.snapshot,
        watermark: summary.watermark,
        contentHash: summary.contentHash,
        createdAt: summary.createdAt,
        expiresAt: iso(found.share.expiresAt),
      };
    });
  }

  // ---- Jobs ----------------------------------------------------------

  async function listDueSummaryJobs(
    now: string,
    limit = 100,
    cursor?: SummaryJobCursor,
  ): Promise<DueSummaryJobs> {
    parse(summaryJobCursorSchema, {
      scheduledAt: now,
      recipientId: "00000000-0000-4000-8000-000000000000",
    });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new CoreError("invalid_input", 400);
    const position = cursor ? parse(summaryJobCursorSchema, cursor) : null;
    const after = position
      ? or(
          sql`${audienceRecipients.nextDueAt}>${position.scheduledAt}::timestamptz`,
          and(
            sql`${audienceRecipients.nextDueAt}=${position.scheduledAt}::timestamptz`,
            sql`${audienceRecipients.id}>${position.recipientId}::uuid`,
          ),
        )
      : undefined;
    const rows = await db
      .select()
      .from(audienceRecipients)
      .where(
        and(
          eq(audienceRecipients.enabled, true),
          lte(audienceRecipients.nextDueAt, new Date(now)),
          after,
        ),
      )
      .orderBy(audienceRecipients.nextDueAt, audienceRecipients.id)
      .limit(limit + 1);
    const jobs = rows.slice(0, limit).map((row) => ({
      recipientId: row.id,
      scheduledAt: iso(row.nextDueAt),
      version: row.version,
    }));
    const last = jobs.at(-1);
    return {
      jobs,
      nextCursor:
        rows.length > limit && last
          ? { scheduledAt: last.scheduledAt, recipientId: last.recipientId }
          : null,
    };
  }
  /**
   * One summary per recipient per local day. Stale or duplicate jobs are
   * skipped without change; a missed day produces only the current day.
   */
  async function generateDailySummary(
    recipientId: string,
    scheduledAt: string,
    version: number,
  ): Promise<SummaryJobResult> {
    const job = parse(summaryJobSchema, { recipientId, scheduledAt, version });
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${SYSTEM_ACTOR_ID},true)`,
      );
      const [recipient] = await tx
        .select()
        .from(audienceRecipients)
        .where(eq(audienceRecipients.id, job.recipientId))
        .for("update");
      const now = clock();
      if (
        !recipient ||
        !recipient.enabled ||
        recipient.version !== job.version ||
        recipient.nextDueAt.getTime() !== Date.parse(job.scheduledAt) ||
        recipient.nextDueAt.getTime() > now.getTime()
      )
        return { status: "skipped", summaryId: null };
      const zone = recipient.timeZone;
      const day = digestLocalDate(now, zone);
      const slot = digestInstantForDay(day, recipient.deliverAt, zone);
      const nextDue = nextDigestInstant(now, recipient.deliverAt, zone);
      const [state] = await tx
        .select({ tag: audienceTags, archivedAt: workspaces.archivedAt })
        .from(audienceTags)
        .innerJoin(workspaces, eq(workspaces.id, audienceTags.workspaceId))
        .where(eq(audienceTags.id, recipient.tagId))
        .for("share", { of: audienceTags });
      let summaryId: string | null = null;
      if (
        state &&
        !state.tag.archivedAt &&
        !state.archivedAt &&
        slot.getTime() <= now.getTime()
      ) {
        const [existing] = await tx
          .select({ id: dailySummaries.id })
          .from(dailySummaries)
          .where(
            and(
              eq(dailySummaries.recipientId, recipient.id),
              eq(dailySummaries.localDate, day),
            ),
          );
        if (!existing) {
          const snapshot = await buildSnapshot(recipient, state.tag, day);
          const id = randomUUID();
          const contentHash = summaryContentHash(snapshot);
          const [row] = await tx
            .insert(dailySummaries)
            .values({
              id,
              workspaceId: recipient.workspaceId,
              tagId: recipient.tagId,
              recipientId: recipient.id,
              localDate: day,
              timeZone: zone,
              locale: recipient.locale,
              snapshot,
              watermark: summaryWatermark(snapshot, id, contentHash),
              contentHash,
            })
            .onConflictDoNothing()
            .returning({ id: dailySummaries.id });
          summaryId = row?.id ?? null;
        }
      }
      await tx
        .update(audienceRecipients)
        .set({ nextDueAt: nextDue, updatedAt: now })
        .where(eq(audienceRecipients.id, recipient.id));
      return { status: summaryId ? "generated" : "skipped", summaryId };
    });
  }

  return {
    ...createSummaryRenderOperations({
      db,
      tokenPepper,
      getDailySummary,
      readSharedSummary,
      getSummaryForRender: async (id) =>
        summaryDTO((await readSummary(db, id)).summary),
    }),
    listAudienceTags,
    createAudienceTag,
    updateAudienceTag,
    listAudienceRecipients,
    createAudienceRecipient,
    updateAudienceRecipient,
    listProjectAudienceTags,
    setProjectAudienceTags,
    listDailySummaries,
    getDailySummary,
    previewDailySummary,
    createSummaryShare,
    listSummaryShares,
    revokeSummaryShare,
    readSharedSummary,
    listDueSummaryJobs,
    generateDailySummary,
  };
}
