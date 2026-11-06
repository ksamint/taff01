import { createSummaryProcessor } from "../../apps/worker/src/summaries.ts";
import { createCore } from "../../packages/core/src/index.ts";
import { connectDatabase } from "../../packages/db/src/index.ts";

// Bounded trusted fixture (ADR 0027): make one recipient due now and run the
// real daily job, exactly as the worker's minute scan would.
const [recipientId] = process.argv.slice(2);
if (!recipientId) throw new Error("recipientId required");
const connection = connectDatabase(process.env.DATABASE_URL!);
const core = createCore({
  databaseUrl: process.env.DATABASE_URL!,
  authUrl: process.env.AUTH_URL!,
  authSecret: process.env.AUTH_SECRET!,
  tokenPepper: process.env.TOKEN_PEPPER!,
});
try {
  const [row] = await connection.client.begin(async (sql) => {
    await sql`select set_config('taff.actor_id','system:e2e-summary',true)`;
    return sql<{ id: string; next_due_at: Date; version: number }[]>`
      update audience_recipients set next_due_at = now() - interval '1 minute'
      where id = ${recipientId}
      returning id, next_due_at, version`;
  });
  if (!row) throw new Error("Recipient not found");
  const result = await core.generateDailySummary(
    row.id,
    new Date(row.next_due_at).toISOString(),
    row.version,
  );
  if (result.status !== "generated" || !result.summaryId)
    throw new Error("Actual summary generation required");
  const render = createSummaryProcessor(
    core,
    {
      add: async () => {
        throw new Error("Render fixture never enqueues jobs");
      },
    },
    process.env.SUMMARY_RENDER_URL,
  );
  if (!process.env.SUMMARY_RENDER_URL)
    throw new Error("SUMMARY_RENDER_URL required for image acceptance");
  for (const format of ["txt", "png"] as const)
    await render({
      name: "summary-render",
      data: { summaryId: result.summaryId, format },
    });
  console.log(JSON.stringify({ summaryId: result.summaryId }));
} finally {
  await core.close();
  await connection.close();
}
