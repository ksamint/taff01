import {
  activity,
  type Database,
  dailySummaries,
  summaryRenders,
  summaryShares,
  type Transaction,
} from "@taff/db";
import {
  changeEventSchema,
  type DailySummary,
  idSchema,
  type SharedSummary,
  type StoreSummaryRenderInput,
  type SummaryRender,
  type SummaryRenderFormat,
  storeSummaryRenderInputSchema,
  summaryRenderFormatSchema,
} from "@taff/schemas";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import { CoreError, hashToken, type Principal } from "./index";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function createSummaryRenderOperations({
  db,
  tokenPepper,
  getSummaryForRender,
  getDailySummary,
  readSharedSummary,
}: {
  db: Database;
  tokenPepper: string;
  getSummaryForRender(id: string): Promise<DailySummary>;
  getDailySummary(p: Principal, id: string): Promise<DailySummary>;
  readSharedSummary(token: string): Promise<SharedSummary>;
}) {
  const dto = (row: typeof summaryRenders.$inferSelect): SummaryRender => {
    const { bytes, ...fields } = row;
    return {
      ...fields,
      data: bytes ? Buffer.from(bytes).toString("base64") : null,
      createdAt: row.createdAt.toISOString(),
    };
  };
  async function stored(
    summaryId: string,
    format: SummaryRenderFormat,
    query: Database | Transaction = db,
  ) {
    const [row] = await query
      .select()
      .from(summaryRenders)
      .where(
        and(
          eq(summaryRenders.summaryId, summaryId),
          eq(summaryRenders.format, format),
        ),
      );
    if (!row) throw new CoreError("not_found", 404);
    return dto(row);
  }
  /** Worker-only boundary; never expose through a human or agent adapter. */
  async function storeSummaryRender(input: StoreSummaryRenderInput) {
    const body = storeSummaryRenderInputSchema.parse(input);
    const source = await getSummaryForRender(body.summaryId);
    const bytes =
      body.format === "png" ? Buffer.from(body.data!, "base64") : null;
    if (
      bytes &&
      (!bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
        bytes.length > 409600 ||
        bytes.toString("base64") !== body.data)
    )
      throw new CoreError("invalid_input", 400);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id','system:summary-render',true)`,
      );
      await tx
        .insert(summaryRenders)
        .values({
          workspaceId: source.workspaceId,
          summaryId: source.id,
          format: body.format,
          body: body.body ?? null,
          bytes,
          byteSize: bytes?.length ?? Buffer.byteLength(body.body!, "utf8"),
          rendererVersion: body.rendererVersion,
          contentHash: source.contentHash,
        })
        .onConflictDoNothing();
      return stored(source.id, body.format, tx);
    });
  }
  async function getSummaryRender(
    p: Principal,
    summaryId: string,
    format: SummaryRenderFormat,
  ) {
    idSchema.parse(summaryId);
    summaryRenderFormatSchema.parse(format);
    await getDailySummary(p, summaryId);
    return stored(summaryId, format);
  }
  async function getSharedSummaryRender(
    token: string,
    format: SummaryRenderFormat,
  ) {
    summaryRenderFormatSchema.parse(format);
    await readSharedSummary(token);
    const [share] = await db
      .select({ summaryId: summaryShares.summaryId })
      .from(summaryShares)
      .where(eq(summaryShares.tokenHash, hashToken(token, tokenPepper)));
    if (!share) throw new CoreError("not_found", 404);
    const {
      id: _id,
      workspaceId: _workspace,
      summaryId: _summary,
      ...publicRender
    } = await stored(share.summaryId, format);
    return publicRender;
  }
  async function listMissingSummaryRenders(
    now = new Date().toISOString(),
    formats: SummaryRenderFormat[] = ["txt", "png"],
  ) {
    for (const format of formats) summaryRenderFormatSchema.parse(format);
    const date = new Date(now);
    if (!Number.isFinite(date.getTime()))
      throw new CoreError("invalid_input", 400);
    // Limit missing jobs after filtering, so completed rows cannot starve later summaries.
    return db
      .select({
        summaryId: dailySummaries.id,
        format: sql<SummaryRenderFormat>`render_format.format`,
      })
      .from(dailySummaries)
      .innerJoin(
        sql`(VALUES ('txt'),('png')) AS render_format(format)`,
        sql`true`,
      )
      .leftJoin(
        summaryRenders,
        and(
          eq(summaryRenders.summaryId, dailySummaries.id),
          sql`${summaryRenders.format}=render_format.format`,
        ),
      )
      .where(
        and(
          gte(
            dailySummaries.createdAt,
            new Date(date.getTime() - 7 * 86400000),
          ),
          lte(dailySummaries.createdAt, date),
          isNull(summaryRenders.id),
          inArray(sql`render_format.format`, formats),
          notExists(
            db
              .select({ id: activity.id })
              .from(activity)
              .where(
                and(
                  sql`${activity.action}='summary.render_failed'`,
                  sql`${activity.resourceId}=${dailySummaries.id}::text`,
                  sql`${activity.details}->>'format'=render_format.format`,
                  gte(activity.createdAt, new Date(date.getTime() - 86400000)),
                ),
              ),
          ),
        ),
      )
      .orderBy(
        dailySummaries.createdAt,
        dailySummaries.id,
        sql`case when render_format.format='txt' then 0 else 1 end`,
      )
      .limit(500);
  }

  async function recordSummaryRenderFailure(
    summaryId: string,
    format: SummaryRenderFormat,
  ) {
    idSchema.parse(summaryId);
    summaryRenderFormatSchema.parse(format);
    const source = await getSummaryForRender(summaryId);
    await db.transaction(async (tx) => {
      const actorId = "system:summary-render";
      await tx.execute(sql`select set_config('taff.actor_id',${actorId},true)`);
      const [change] = await tx
        .insert(activity)
        .values({
          actorId,
          workspaceId: source.workspaceId,
          action: "summary.render_failed",
          resourceId: summaryId,
          details: { format },
        })
        .returning({ id: activity.id });
      const event = changeEventSchema.parse({
        activityId: change.id,
        workspaceId: source.workspaceId,
        resourceId: summaryId,
        action: "summary.render_failed",
        actorId,
        userId: null,
      });
      await tx.execute(
        sql`select pg_notify('taff_changes',${JSON.stringify(event)})`,
      );
    });
  }
  return {
    storeSummaryRender,
    getSummaryRender,
    getSharedSummaryRender,
    getSummaryForRender,
    listMissingSummaryRenders,
    recordSummaryRenderFailure,
  };
}
