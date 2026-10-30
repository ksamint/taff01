import { type Database, members, type Transaction, workspaces } from "@taff/db";
import { and, eq, sql } from "drizzle-orm";

export const DEFAULT_AGENT_NAME = "默认智能体 / Default agent";

/** Caller supplies its transaction/audit actor. Never issues credentials. */
export async function ensureDefaultAgent(tx: Transaction, workspaceId: string) {
  // Same parent lock as membership changes; concurrent backfills cannot duplicate.
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("update");
  const [existing] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.workspaceId, workspaceId), eq(members.kind, "agent")))
    .limit(1);
  if (existing) return false;
  await tx.insert(members).values({
    workspaceId,
    name: DEFAULT_AGENT_NAME,
    kind: "agent",
    role: "member",
    userId: null,
  });
  return true;
}

/** Trusted migration boundary, not exposed by HTTP/MCP or the public core API. */
export async function backfillDefaultAgents(db: Database) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('taff.actor_id','system:default-agent-migration',true)`,
    );
    // Match workspace creation's namespace lock before taking parent row locks.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
    );
    const rows = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .orderBy(workspaces.id);
    let created = 0;
    for (const row of rows) if (await ensureDefaultAgent(tx, row.id)) created++;
    return { workspacesBackfilled: created };
  });
}

/** Read-only deployment inventory; no identities or credentials are returned. */
export async function inspectDefaultAgents(db: Database) {
  const rows = await db.select().from(workspaces).orderBy(workspaces.id);
  const agents = await db
    .select({ workspaceId: members.workspaceId, name: members.name })
    .from(members)
    .where(eq(members.kind, "agent"));
  const names = (id: string) =>
    agents
      .filter((agent) => agent.workspaceId === id)
      .map((agent) => agent.name);
  return {
    workspaces: rows.length,
    workspacesWithoutAgents: rows.filter((row) => !names(row.id).length).length,
    organizations: rows
      .filter((row) => !row.personalOwnerId && !row.archivedAt)
      .map((row) => ({ id: row.id, name: row.name, agents: names(row.id) })),
  };
}
