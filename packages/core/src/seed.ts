import { fileURLToPath } from "node:url";
import { connectDatabase, members, tasks, user, workspaces } from "@taff/db";
import { prototypePeople } from "@taff/schemas/prototype-data";
import { eq, sql } from "drizzle-orm";
import { createCore } from "./index";
import { seedPrototype } from "./prototype-seed";

const legacyNames = ["Alex", "Mei", "Sam", "Lin", "Jordan"];

export async function seedDemo(options: {
  databaseUrl: string;
  authUrl: string;
  authSecret: string;
  tokenPepper: string;
  password: string;
  /** Optional fixed local date for isolated visual baselines; normal seed uses today. */
  seedDate?: string;
}) {
  if (options.password.length < 8 || options.password.length > 128)
    throw new Error("DEMO_PASSWORD must be 8–128 characters");
  const core = createCore(options);
  const connection = connectDatabase(options.databaseUrl);
  try {
    return await connection.db.transaction(async (tx) => {
      // Serialize auth bootstrap too; concurrent seeds must not race signup.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('taff-demo-seed'))`,
      );
      const users: (typeof user.$inferSelect)[] = [];
      // Bootstrap before any workspace writes acquire the system-admin lock.
      // Better Auth independently commits each atomic user/personal-workspace signup.
      for (const [index, person] of prototypePeople.entries()) {
        let [existing] = await tx
          .select()
          .from(user)
          .where(eq(user.email, person.email))
          .limit(1);
        if (!existing) {
          await core.auth.api.signUpEmail({
            body: {
              name: legacyNames[index] ?? person.name.en,
              email: person.email,
              password: options.password,
            },
          });
          [existing] = await tx
            .select()
            .from(user)
            .where(eq(user.email, person.email))
            .limit(1);
        }
        if (!existing) throw new Error("Demo signup did not create a user");
        users.push(existing);
      }
      const actor = users[0];
      await tx.execute(
        sql`select set_config('taff.actor_id', ${actor.id}, true)`,
      );
      let [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.seedKey, "demo-v1"))
        .limit(1);
      if (!workspace) {
        [workspace] = await tx
          .insert(workspaces)
          .values({ name: "Taff Demo", seedKey: "demo-v1" })
          .returning();
        for (const person of users.slice(0, 5))
          await tx
            .insert(members)
            .values({
              workspaceId: workspace.id,
              userId: person.id,
              name: person.name,
              kind: "person",
              role: "admin",
            })
            .onConflictDoNothing();
        for (const name of [
          "Research Agent",
          "Writing Agent",
          "Planning Agent",
        ])
          await tx
            .insert(members)
            .values({
              workspaceId: workspace.id,
              name,
              kind: "agent",
              role: "member",
            })
            .onConflictDoNothing();
        const team = await tx
          .select()
          .from(members)
          .where(eq(members.workspaceId, workspace.id));
        const owner = team.find((member) => member.userId === actor.id);
        const worker = team.find((member) => member.kind === "agent");
        if (!owner || !worker)
          throw new Error("Demo membership provisioning failed");
        for (const [index, title] of [
          "Plan the week / 规划本周",
          "Research product ideas / 调研产品想法",
          "Review the draft / 审阅草稿",
        ].entries())
          await tx.insert(tasks).values({
            workspaceId: workspace.id,
            ownerId: owner.id,
            workerId: index === 1 ? worker.id : null,
            title,
          });
      }
      // Existing legacy content, identities, passwords, and user edits are untouched.
      await seedPrototype(tx, users, {
        seedDate: options.seedDate,
        timeZone: actor.tz,
      });
      return { workspaceId: workspace.id, email: actor.email };
    });
  } finally {
    await core.close();
    await connection.close();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { DATABASE_URL, AUTH_URL, AUTH_SECRET, TOKEN_PEPPER, DEMO_PASSWORD } =
    process.env;
  if (
    !DATABASE_URL ||
    !AUTH_URL ||
    !AUTH_SECRET ||
    !TOKEN_PEPPER ||
    !DEMO_PASSWORD
  )
    throw new Error(
      "DATABASE_URL, AUTH_URL, AUTH_SECRET, TOKEN_PEPPER and DEMO_PASSWORD are required",
    );
  try {
    const result = await seedDemo({
      databaseUrl: DATABASE_URL,
      authUrl: AUTH_URL,
      authSecret: AUTH_SECRET,
      tokenPepper: TOKEN_PEPPER,
      password: DEMO_PASSWORD,
      seedDate: process.env.SEED_DATE,
    });
    console.info(
      `Demo workspace ${result.workspaceId}; sign in as ${result.email} using DEMO_PASSWORD`,
    );
  } catch {
    // Never print driver parameters, auth bodies, or credentials from seed failures.
    console.error("Demo seed failed");
    process.exitCode = 1;
  }
}
