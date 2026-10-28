import { connectDatabase } from "@taff/db";
import { migrateDatabase } from "../../db/src/migrate";
import { backfillDefaultAgents } from "./default-agents";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
await migrateDatabase(url);
const connection = connectDatabase(url);
try {
  console.log(JSON.stringify(await backfillDefaultAgents(connection.db)));
} finally {
  await connection.close();
}
