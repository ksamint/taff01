import {
  type Database,
  dailyDigests,
  inboxItems,
  members,
  notificationPreferences,
  runEvents,
  runs,
  type Transaction,
  tasks,
  user,
} from "@taff/db";
import {
  canonicalCalendarTimeZone,
  type DailyDigest,
  type DailyDigestList,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type DigestJobCursor,
  type DigestJobResult,
  type DigestSnapshot,
  type DueDigestJobs,
  digestJobCursorSchema,
  digestJobSchema,
  digestSnapshotSchema,
  idSchema,
  type NotificationPreferences,
  SchemaError,
  type UpdateNotificationPreferences,
  updateNotificationPreferencesSchema,
} from "@taff/schemas";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import {
  digestInstantForDay,
  digestLocalDate,
  nextDigestInstant,
} from "./notifications-time";
import { type Action, type Actor, can, type Resource } from "./permissions";

type Dependencies = {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
};
function parse<T>(schema: { parse(v: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
function preferencesDTO(
  row: typeof notificationPreferences.$inferSelect,
): NotificationPreferences {
  return {
    version: row.version,
    review: row.review,
    block: row.block,
    mention: row.mention,
    done: row.done,
    digest: row.digest,
    digestAt: row.digestAt as NotificationPreferences["digestAt"],
    quiet: row.quiet,
  };
}
function digestDTO(row: typeof dailyDigests.$inferSelect): DailyDigest {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    localDate: row.localDate,
    timeZone: row.timeZone,
    locale: row.locale as DailyDigest["locale"],
    snapshot: digestSnapshotSchema.parse(row.snapshot),
    createdAt: row.createdAt.toISOString(),
  };
}
function localSql(column: SQL, zone: string): SQL {
  const canonical = canonicalCalendarTimeZone(zone);
  return /^[+-]/.test(canonical)
    ? sql`${column} AT TIME ZONE ${canonical}::interval`
    : sql`${column} AT TIME ZONE ${canonical}`;
}
export function createNotificationOperations({
  db,
  mutation,
  requireMember,
}: Dependencies) {
  async function self(
    q: Database | Transaction,
    p: Principal,
    action: "notification:read" | "notification:update",
    lock = false,
  ) {
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    let query = q.select().from(user).where(eq(user.id, p.userId));
    const rows = lock ? await query.for("update") : await query;
    const person = rows[0];
    if (!person) throw new CoreError("unauthorized", 401);
    const actor: Actor = {
      id: p.userId,
      workspaceId: "",
      userId: p.userId,
      name: person.name,
      kind: "person",
      role: "member",
    };
    if (!can(actor, action, { userId: p.userId }))
      throw new CoreError("forbidden", 403);
    return person;
  }
  async function rescheduleForProfile(
    tx: Transaction,
    userId: string,
    zone: string,
  ) {
    const [row] = await tx
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.id, userId))
      .for("update");
    if (row)
      await tx
        .update(notificationPreferences)
        .set({
          nextDigestAt: nextDigestInstant(new Date(), row.digestAt, zone),
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, userId));
  }
  async function getNotificationPreferences(
    p: Principal,
  ): Promise<NotificationPreferences> {
    const person = await self(db, p, "notification:read");
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.id, person.id));
    return row ? preferencesDTO(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  async function updateNotificationPreferences(
    p: Principal,
    input: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences> {
    const body = parse(updateNotificationPreferencesSchema, input);
    return mutation(p, async (tx) => {
      const person = await self(tx, p, "notification:update", true);
      const [current] = await tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, person.id))
        .for("update");
      if ((current?.version ?? 1) !== body.version)
        throw new CoreError("conflict", 409);
      const values = {
        ...body,
        id: person.id,
        version: body.version + 1,
        nextDigestAt: nextDigestInstant(new Date(), body.digestAt, person.tz),
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(notificationPreferences)
        .values(values)
        .onConflictDoUpdate({ target: notificationPreferences.id, set: values })
        .returning();
      return preferencesDTO(row);
    });
  }
  async function listDailyDigests(
    p: Principal,
    w: string,
  ): Promise<DailyDigestList> {
    parse(idSchema, w);
    const person = await self(db, p, "notification:read");
    const actor = await requireMember(db, p, w, "digest:read");
    const rows = await db
      .select()
      .from(dailyDigests)
      .where(
        and(
          eq(dailyDigests.workspaceId, w),
          eq(dailyDigests.userId, person.id),
          eq(dailyDigests.memberId, actor.id),
        ),
      )
      .orderBy(
        desc(dailyDigests.localDate),
        desc(dailyDigests.createdAt),
        dailyDigests.id,
      )
      .limit(32);
    return {
      items: rows.slice(0, 31).map(digestDTO),
      truncated: rows.length > 31,
    };
  }
  async function getDailyDigest(
    p: Principal,
    id: string,
  ): Promise<DailyDigest> {
    parse(idSchema, id);
    const person = await self(db, p, "notification:read");
    const [row] = await db
      .select()
      .from(dailyDigests)
      .where(and(eq(dailyDigests.id, id), eq(dailyDigests.userId, person.id)));
    if (!row) throw new CoreError("not_found", 404);
    await requireMember(db, p, row.workspaceId, "digest:read", {
      workspaceId: row.workspaceId,
      memberId: row.memberId,
    });
    return digestDTO(row);
  }
  async function listDueDigestJobs(
    now: string,
    limit = 100,
    cursor?: DigestJobCursor,
  ): Promise<DueDigestJobs> {
    parse(digestJobCursorSchema, { userId: "clock", scheduledAt: now });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new CoreError("invalid_input", 400);
    const position = cursor ? parse(digestJobCursorSchema, cursor) : null;
    const after = position
      ? or(
          sql`${notificationPreferences.nextDigestAt}>${position.scheduledAt}::timestamptz`,
          and(
            sql`${notificationPreferences.nextDigestAt}=${position.scheduledAt}::timestamptz`,
            sql`${notificationPreferences.id}>${position.userId}`,
          ),
        )
      : undefined;
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.digest, true),
          lte(notificationPreferences.nextDigestAt, new Date(now)),
          after,
        ),
      )
      .orderBy(notificationPreferences.nextDigestAt, notificationPreferences.id)
      .limit(limit + 1);
    const jobs = rows.slice(0, limit).map((row) => ({
      userId: row.id,
      scheduledAt: row.nextDigestAt.toISOString(),
      preferenceVersion: row.version,
    }));
    const last = jobs.at(-1);
    return {
      jobs,
      nextCursor:
        rows.length > limit && last
          ? { scheduledAt: last.scheduledAt, userId: last.userId }
          : null,
    };
  }
  async function snapshot(
    tx: Transaction,
    member: typeof members.$inferSelect,
    day: string,
    zone: string,
  ): Promise<DigestSnapshot> {
    const reviewsPredicate = and(
      eq(inboxItems.workspaceId, member.workspaceId),
      eq(inboxItems.memberId, member.id),
      eq(inboxItems.kind, "review"),
      isNull(inboxItems.resolvedAt),
    );
    const reviewsQuery = () =>
      tx
        .select({
          taskId: tasks.id,
          title: tasks.title,
          runId: inboxItems.runId,
        })
        .from(inboxItems)
        .innerJoin(tasks, eq(tasks.id, inboxItems.taskId))
        .where(reviewsPredicate);
    const reviews = await reviewsQuery()
      .orderBy(desc(inboxItems.createdAt), inboxItems.id)
      .limit(20);
    const [reviewCount] = await tx
      .select({ n: count() })
      .from(inboxItems)
      .innerJoin(tasks, eq(tasks.id, inboxItems.taskId))
      .where(reviewsPredicate);
    const duePredicate = and(
      eq(tasks.workspaceId, member.workspaceId),
      sql`${tasks.status}<>'done'`,
      sql`(${localSql(sql`${tasks.dueAt}`, zone)})::date=${day}::date`,
    );
    const dueRows = await tx
      .select({ taskId: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
      .from(tasks)
      .where(duePredicate)
      .orderBy(tasks.dueAt, tasks.id)
      .limit(20);
    const [dueCount] = await tx
      .select({ n: count() })
      .from(tasks)
      .where(duePredicate);
    const agentPredicate = and(
      eq(runs.workspaceId, member.workspaceId),
      or(
        sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
        sql`(${localSql(sql`${runs.finishedAt}`, zone)})::date=${day}::date`,
      ),
    );
    const agentRows = await tx
      .select({ run: runs, title: tasks.title })
      .from(runs)
      .innerJoin(tasks, eq(tasks.id, runs.taskId))
      .where(agentPredicate)
      .orderBy(desc(runs.updatedAt), runs.id)
      .limit(20);
    const [agentCount] = await tx
      .select({ n: count() })
      .from(runs)
      .where(agentPredicate);
    const events = agentRows.length
      ? await tx
          .select({
            runId: runEvents.runId,
            n: count(),
            latest: sql<Date | null>`max(${runEvents.createdAt})`,
          })
          .from(runEvents)
          .where(
            inArray(
              runEvents.runId,
              agentRows.map((r) => r.run.id),
            ),
          )
          .groupBy(runEvents.runId)
      : [];
    const byRun = new Map(events.map((e) => [e.runId, e]));
    return {
      reviews: { count: reviewCount.n, items: reviews },
      dueToday: {
        count: dueCount.n,
        items: dueRows.map((r) => ({ ...r, dueAt: r.dueAt!.toISOString() })),
      },
      agents: {
        count: agentCount.n,
        items: agentRows.map(({ run, title }) => {
          const event = byRun.get(run.id);
          return {
            taskId: run.taskId,
            title,
            runId: run.id,
            agentId: run.agentId,
            status:
              run.status as DigestSnapshot["agents"]["items"][number]["status"],
            lastEventAt: event?.latest
              ? new Date(event.latest).toISOString()
              : null,
            eventCount: event?.n ?? 0,
            durationMs: run.durationMs,
            costMicros: run.costMicros,
          };
        }),
      },
      truncated: reviewCount.n > 20 || dueCount.n > 20 || agentCount.n > 20,
    };
  }
  async function generateDailyDigest(
    userId: string,
    scheduledAt: string,
    preferenceVersion: number,
  ): Promise<DigestJobResult> {
    const job = parse(digestJobSchema, {
      userId,
      scheduledAt,
      preferenceVersion,
    });
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id','system:daily-digest',true)`,
      );
      const [person] = await tx
        .select()
        .from(user)
        .where(eq(user.id, job.userId))
        .for("update");
      if (!person) return { status: "skipped", digestIds: [] };
      const [pref] = await tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, job.userId))
        .for("update");
      const now = new Date();
      if (
        !pref ||
        !pref.digest ||
        pref.version !== job.preferenceVersion ||
        pref.nextDigestAt.getTime() !== Date.parse(job.scheduledAt) ||
        pref.nextDigestAt.getTime() > now.getTime()
      )
        return { status: "skipped", digestIds: [] };
      const day = digestLocalDate(now, person.tz);
      const currentSlot = digestInstantForDay(day, pref.digestAt, person.tz);
      const nextDue = nextDigestInstant(now, pref.digestAt, person.tz);
      const ids: string[] = [];
      if (currentSlot.getTime() <= now.getTime()) {
        const roster = await tx
          .select()
          .from(members)
          .where(and(eq(members.userId, person.id), eq(members.kind, "person")))
          .orderBy(members.workspaceId)
          .for("share");
        for (const member of roster) {
          if (
            !can(member, "digest:read", {
              workspaceId: member.workspaceId,
              memberId: member.id,
            })
          )
            continue;
          const [existing] = await tx
            .select({ id: dailyDigests.id })
            .from(dailyDigests)
            .where(
              and(
                eq(dailyDigests.userId, person.id),
                eq(dailyDigests.workspaceId, member.workspaceId),
                eq(dailyDigests.localDate, day),
              ),
            );
          if (existing) continue;
          const [row] = await tx
            .insert(dailyDigests)
            .values({
              userId: person.id,
              workspaceId: member.workspaceId,
              memberId: member.id,
              localDate: day,
              timeZone: canonicalCalendarTimeZone(person.tz),
              locale: person.locale,
              snapshot: await snapshot(tx, member, day, person.tz),
            })
            .onConflictDoNothing()
            .returning();
          if (row) {
            ids.push(row.id);
            await tx.insert(inboxItems).values({
              workspaceId: member.workspaceId,
              memberId: member.id,
              kind: "digest",
              title: day,
              digestId: row.id,
            });
          }
        }
      }
      await tx
        .update(notificationPreferences)
        .set({ nextDigestAt: nextDue, updatedAt: now })
        .where(eq(notificationPreferences.id, person.id));
      return { status: ids.length ? "generated" : "skipped", digestIds: ids };
    });
  }
  return {
    rescheduleForProfile,
    operations: {
      getNotificationPreferences,
      updateNotificationPreferences,
      listDailyDigests,
      getDailyDigest,
      listDueDigestJobs,
      generateDailyDigest,
    },
  };
}
