import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
export function connectDatabase(
  databaseUrl: string,
  statementTimeoutMs?: number,
) {
  const client = postgres(databaseUrl, {
    max: 10,
    // Explicit URL parameters retain postgres.js precedence over these defaults.
    connection:
      statementTimeoutMs === undefined
        ? undefined
        : { statement_timeout: statementTimeoutMs },
  });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end() };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export * from "./schema";
