import { type Database, members, type Transaction, user } from "@taff/db";
import {
  type EmailVerificationConsume,
  type EmailVerificationRequest,
  emailVerificationConsumeSchema,
  emailVerificationRequestSchema,
  SchemaError,
} from "@taff/schemas";
import { createEmailVerificationToken } from "better-auth/api";
import { verifyJWT } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { deliverEmail, type EmailStatus, type EmailTransport } from "./email";
import { emailMessage } from "./email-messages";
import { CoreError, type Principal } from "./index";
import { can } from "./permissions";

type Dependencies = {
  db: Database;
  authSecret: string;
  authUrl: string;
  email?: EmailTransport;
  onEmailStatus?: (status: EmailStatus) => void;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
};
function parse<T>(schema: { parse(v: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw error;
  }
}
export function createEmailVerificationOperations(deps: Dependencies) {
  async function self(q: Database | Transaction, p: Principal, lock = false) {
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    const query = q.select().from(user).where(eq(user.id, p.userId));
    const [person] = lock ? await query.for("update") : await query;
    if (!person) throw new CoreError("unauthorized", 401);
    const [identity] = await q
      .select()
      .from(members)
      .where(eq(members.userId, p.userId))
      .limit(1);
    if (!can(identity ?? null, "profile:update", { userId: p.userId }))
      throw new CoreError("forbidden", 403);
    return person;
  }
  return {
    async getEmailVerificationStatus(p: Principal) {
      return { emailVerified: (await self(deps.db, p)).emailVerified };
    },
    async requestEmailVerification(
      p: Principal,
      input: EmailVerificationRequest,
    ) {
      parse(emailVerificationRequestSchema, input);
      const person = await self(deps.db, p);
      if (person.emailVerified) return { emailVerified: true, delivery: null };
      const token = await createEmailVerificationToken(
        deps.authSecret,
        person.email,
        undefined,
        3600,
        {
          purpose: "taff.email-verification",
          userId: person.id,
        },
      );
      const link = `${new URL(deps.authUrl).origin}/#verifyEmail=${encodeURIComponent(token)}`;
      const delivery = await deliverEmail(
        deps.email,
        "verification",
        {
          to: person.email,
          ...emailMessage("verification", person.locale, link),
        },
        deps.onEmailStatus,
      );
      return { emailVerified: false, delivery };
    },
    async verifyEmailOwnership(p: Principal, input: EmailVerificationConsume) {
      const body = parse(emailVerificationConsumeSchema, input);
      if (p.kind !== "user") throw new CoreError("forbidden", 403);
      const payload = await verifyJWT(body.token, deps.authSecret);
      if (
        !payload ||
        payload.purpose !== "taff.email-verification" ||
        payload.userId !== p.userId ||
        typeof payload.email !== "string" ||
        payload.updateTo != null ||
        payload.requestType != null
      )
        throw new CoreError("invalid_input", 400);
      return deps.mutation(p, async (tx) => {
        const person = await self(tx, p, true);
        if (person.email.trim().toLowerCase() !== payload.email)
          throw new CoreError("invalid_input", 400);
        if (!person.emailVerified)
          await tx
            .update(user)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(user.id, person.id));
        return { emailVerified: true };
      });
    },
  };
}
