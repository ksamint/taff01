import { createHash, createHmac, randomUUID } from "node:crypto";
import { account, type Database, members, user, workspaces } from "@taff/db";
import {
  type AdministrationProvision,
  administrationProvisionSchema,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { CoreError } from "./index";
/** Trusted runtime boundary; never expose through a user or agent adapter. */
export function createAdministrationOperations(
  db: Database,
  authSecret: string,
  password: {
    hash(value: string): Promise<string>;
    verify(input: { hash: string; password: string }): Promise<boolean>;
  },
) {
  async function provisionAdministration(input: AdministrationProvision) {
    const parsed = administrationProvisionSchema.safeParse(input);
    if (!parsed.success) throw new CoreError("invalid_input", 400);
    const body = parsed.data;
    const normalizedUsername = body.orgAdmin.username.toLowerCase();
    const hashedPassword = await password.hash(body.orgAdmin.password);
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:administration',true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
        );
        const organizations: { id: string; name: string }[] = [];
        for (const name of body.workspaceNames) {
          const existing = await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.name, name))
            .for("update");
          if (existing.length > 1) throw new CoreError("conflict", 409);
          const row =
            existing[0] ??
            (await tx.insert(workspaces).values({ name }).returning())[0];
          organizations.push({ id: row.id, name: row.name });
        }
        const organization = organizations.find(
          (row) => row.name === body.orgAdmin.workspaceName,
        )!;
        const identity = createHash("sha256")
          .update(`${organization.id}\0${normalizedUsername}`)
          .digest("hex");
        const adminId = `provisioned-org-admin:${identity}`;
        const email = `${identity}@username.taff.invalid`;
        const [prior] = await tx
          .select()
          .from(user)
          .where(eq(user.username, normalizedUsername))
          .for("update");
        let createdOrgAdmin = false;
        if (prior) {
          const [credential] = await tx
            .select()
            .from(account)
            .where(
              and(
                eq(account.userId, prior.id),
                eq(account.providerId, "credential"),
              ),
            );
          if (
            prior.id !== adminId ||
            prior.email !== email ||
            !credential?.password ||
            !(await password.verify({
              hash: credential.password,
              password: body.orgAdmin.password,
            }))
          )
            throw new CoreError("conflict", 409);
        } else {
          // Account/user/workspace creation shares this transaction and audit.
          await tx.insert(user).values({
            id: adminId,
            name: "Organization administrator",
            email,
            username: normalizedUsername,
          });
          await tx.execute(
            sql`select set_config('taff.actor_id','system:administration',true)`,
          );
          await tx.insert(account).values({
            id: randomUUID(),
            userId: adminId,
            accountId: adminId,
            providerId: "credential",
            password: hashedPassword,
          });
          createdOrgAdmin = true;
        }
        await tx
          .insert(members)
          .values({
            workspaceId: organization.id,
            userId: adminId,
            name: prior?.name ?? "Organization administrator",
            kind: "person",
            role: "admin",
          })
          .onConflictDoUpdate({
            target: [members.workspaceId, members.userId],
            set: { role: "admin", updatedAt: new Date() },
            setWhere: sql`${members.role} <> 'admin'`,
          });
        const systemAdminUserIds: string[] = [];
        for (const phone of body.systemAdminPhones) {
          const [person] = await tx
            .select()
            .from(user)
            .where(eq(user.phoneNumber, phone))
            .for("update");
          if (person) {
            if (!person.systemAdmin)
              await tx
                .update(user)
                .set({ systemAdmin: true, updatedAt: new Date() })
                .where(eq(user.id, person.id));
            systemAdminUserIds.push(person.id);
          } else {
            const id = randomUUID();
            const opaque = createHmac("sha256", authSecret)
              .update(`sms:email\0${phone}`)
              .digest("hex");
            await tx.insert(user).values({
              id,
              name: "System administrator",
              email: `${opaque}@phone.taff.invalid`,
              phoneNumber: phone,
              phoneNumberVerified: false,
              systemAdmin: true,
            });
            systemAdminUserIds.push(id);
          }
          await tx.execute(
            sql`select set_config('taff.actor_id','system:administration',true)`,
          );
        }
        return {
          workspaces: organizations,
          systemAdminUserIds,
          orgAdminUserId: adminId,
          createdOrgAdmin,
        };
      });
    } catch (error) {
      if (error instanceof CoreError) throw error;
      const cause =
        error instanceof Error && "cause" in error ? error.cause : error;
      if (
        cause &&
        typeof cause === "object" &&
        "code" in cause &&
        cause.code === "23505"
      )
        throw new CoreError("conflict", 409);
      throw error;
    }
  }
  return { provisionAdministration };
}
