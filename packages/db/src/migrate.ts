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
