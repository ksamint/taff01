// Test-process fixture only; never imported by the API or exported by core.
import { connectDatabase, user } from "@taff/db";
import { idSchema } from "@taff/schemas";
import { eq, sql } from "drizzle-orm";

export async function setLocalTestSystemAdmin(
  databaseUrl: string,
  userId: string,
  enabled: boolean,
) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "System administrator fixture requires a loopback database",
    );
  idSchema.parse(userId);
  const { db, close } = connectDatabase(databaseUrl);
  try {
    await db.transaction(async (tx) => {
      const [fixture] = await tx.select().from(user).where(eq(user.id, userId));
      if (!fixture || !/^m7-[a-f0-9-]+@example\.test$/.test(fixture.email))
        throw new Error(
          "System administrator fixture requires a disposable E2E account",
        );
      await tx.execute(
        sql`select set_config('taff.actor_id', ${userId}, true)`,
      );
      await tx
        .update(user)
        .set({ systemAdmin: enabled })
        .where(eq(user.id, userId));
    });
  } finally {
    await close();
  }
}
