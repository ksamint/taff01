import { mock } from "node:test";
import { createCore } from "../../packages/core/src/index.ts";
import type { DigestJobCursor } from "../../packages/schemas/src/index.ts";

// Bounded trusted fixture: the production API/browser keep their actual clock.
const [userId, workspaceId, instant] = process.argv.slice(2);
const future = new Date(instant);
const core = createCore({
  databaseUrl: process.env.DATABASE_URL!,
  authUrl: process.env.AUTH_URL!,
  authSecret: process.env.AUTH_SECRET!,
  tokenPepper: process.env.TOKEN_PEPPER!,
});
try {
  let cursor: DigestJobCursor | undefined;
  let job:
    | { userId: string; scheduledAt: string; preferenceVersion: number }
    | undefined;
  do {
    const found = await core.listDueDigestJobs(
      future.toISOString(),
      500,
      cursor,
    );
    job = found.jobs.find((item) => item.userId === userId);
    cursor = found.nextCursor ?? undefined;
  } while (!job && cursor);
  if (!job) throw new Error("Real due digest marker required");
  let digestId: string | undefined;
  mock.timers.enable({ apis: ["Date"], now: future });
  try {
    const result = await core.generateDailyDigest(
      job.userId,
      job.scheduledAt,
      job.preferenceVersion,
    );
    if (result.status !== "generated")
      throw new Error("Actual digest generation required");
    for (const id of result.digestIds) {
      const value = await core.getDailyDigest({ kind: "user", userId }, id);
      if (value.workspaceId === workspaceId) digestId = id;
    }
  } finally {
    mock.timers.reset();
  }
  if (!digestId) throw new Error("Persisted workspace digest required");
  process.stdout.write(JSON.stringify({ digestId }));
} finally {
  await core.close();
}
