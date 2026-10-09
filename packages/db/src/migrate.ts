import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "./index";
export async function migrateDatabase(databaseUrl: string) {
  const connection = connectDatabase(databaseUrl);
  try {
    await migrate(connection.db, {
      // Bundled builds ship the SQL files separately and point here.
      migrationsFolder:
        process.env.MIGRATIONS_DIR ??
        fileURLToPath(new URL("../migrations", import.meta.url)),
    });
  } finally {
    await connection.close();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await migrateDatabase(databaseUrl);
}
