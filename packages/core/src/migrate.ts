import { connectDatabase } from "@taff/db";
import { migrateDatabase } from "../../db/src/migrate";
import { backfillDefaultAgents, inspectDefaultAgents } from "./default-agents";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const connection = connectDatabase(url);
try {
  if (process.argv.includes("--inventory")) {
    console.log(JSON.stringify(await inspectDefaultAgents(connection.db)));
  } else {
    await migrateDatabase(url);
    console.log(JSON.stringify(await backfillDefaultAgents(connection.db)));
  }
} finally {
  await connection.close();
}
