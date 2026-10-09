import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { type Database, smsAuthChallenges, smsAuthLimits } from "@taff/db";
import { sendPhoneOtpSchema, verifyPhoneOtpSchema } from "@taff/schemas";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { and, eq, sql } from "drizzle-orm";
import type { SmsProvider } from "./tencent-sms";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const CLIENT_HEADER = "x-taff-sms-peer";
function unavailable(): never {
  throw new APIError("SERVICE_UNAVAILABLE", {
    code: "SMS_UNAVAILABLE",
    message: "sms_unavailable",
  });
}
function rateLimited(retry: number): never {
  throw new APIError(
    "TOO_MANY_REQUESTS",
    { code: "RATE_LIMITED", message: "rate_limited" },
    { "Retry-After": String(retry) },
  );
}
export function createSmsAuth(
  db: Database,
  secret: string,
  provider: SmsProvider,
) {
  const digest = (domain: string, value: string) =>
    createHmac("sha256", secret).update(`${domain}\0${value}`).digest("hex");
  const phoneHash = (phone: string) => digest("sms:phone", phone);
  const codeHash = (phone: string, code: string) =>
    digest("sms:code", `${phone}\0${code}`);
  async function reserve(phone: string, code: string, peer: string) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', 'system:auth', true)`,
      );
      // Includes nonexistent phone/bucket rows, so multi-instance sends serialize.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('taff:sms:send', 0))`,
      );
      const [prior] = await tx
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, phoneHash(phone)))
        .for("update");
      const now = new Date();
      if (prior && now.getTime() - prior.lastSentAt.getTime() < MINUTE)
        return {
          retry: Math.ceil(
            (prior.lastSentAt.getTime() + MINUTE - now.getTime()) / 1000,
          ),
        };
      const sameHour =
        prior && now.getTime() - prior.windowStartedAt.getTime() < HOUR;
      if (sameHour && prior.sendCount >= 5)
        return {
          retry: Math.ceil(
            (prior.windowStartedAt.getTime() + HOUR - now.getTime()) / 1000,
          ),
        };
      const globalBucket = `send:global:${digest("sms:app", "global")}`;
      const buckets = [globalBucket, `send:peer:${peer}`];
      const limits = [];
      for (const bucket of buckets) {
        const [row] = await tx
          .select()
          .from(smsAuthLimits)
          .where(eq(smsAuthLimits.bucket, bucket))
          .for("update");
        const active =
          row && now.getTime() - row.windowStartedAt.getTime() < MINUTE;
        if (active && row.count >= (bucket === globalBucket ? 30 : 10))
          return {
            retry: Math.ceil(
              (row.windowStartedAt.getTime() + MINUTE - now.getTime()) / 1000,
            ),
          };
        limits.push({ bucket, row, active });
      }
      for (const { bucket, row, active } of limits) {
        const values = {
          windowStartedAt: active && row ? row.windowStartedAt : now,
          count: active && row ? row.count + 1 : 1,
          updatedAt: now,
        };
        if (row)
          await tx
            .update(smsAuthLimits)
            .set(values)
            .where(eq(smsAuthLimits.id, row.id));
        else await tx.insert(smsAuthLimits).values({ bucket, ...values });
      }
      const values = {
        codeHash: codeHash(phone, code),
        ready: false,
        attempts: 0,
        expiresAt: new Date(now.getTime() + 5 * MINUTE),
        lastSentAt: now,
        windowStartedAt: sameHour && prior ? prior.windowStartedAt : now,
        sendCount: sameHour && prior ? prior.sendCount + 1 : 1,
        updatedAt: now,
      };
      const [challenge] = prior
        ? await tx
            .update(smsAuthChallenges)
            .set(values)
            .where(eq(smsAuthChallenges.id, prior.id))
            .returning()
        : await tx
            .insert(smsAuthChallenges)
            .values({ phoneHash: phoneHash(phone), ...values })
            .returning();
      return { challenge };
    });
  }
  async function sendOTP(input: unknown, peer: string) {
    const { phoneNumber: phone } = sendPhoneOtpSchema.parse(input);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const reservation = await reserve(phone, code, peer);
    if ("retry" in reservation) rateLimited(reservation.retry ?? 60);
    const challenge = reservation.challenge;
    let delivered = false;
    try {
      await provider.sendOTP({ phoneNumber: phone, code });
      delivered = true;
    } catch {
      // Even ambiguous provider failures keep the paid-send cooldown.
    }
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', 'system:auth', true)`,
      );
      await tx
        .update(smsAuthChallenges)
        .set({
          ready: delivered,
          ...(delivered ? {} : { codeHash: null }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(smsAuthChallenges.id, challenge.id),
            eq(smsAuthChallenges.codeHash, codeHash(phone, code)),
          ),
        );
    });
    if (!delivered) unavailable();
  }
  async function verifyOTP(input: unknown, peer: string): Promise<boolean> {
    const { phoneNumber: phone, code } = verifyPhoneOtpSchema.parse(input);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', 'system:auth', true)`,
      );
      const bucket = `verify:peer:${peer}`;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${bucket}, 0))`,
      );
      const [limit] = await tx
        .select()
        .from(smsAuthLimits)
        .where(eq(smsAuthLimits.bucket, bucket))
        .for("update");
      const now = new Date();
      const active =
        limit && now.getTime() - limit.windowStartedAt.getTime() < MINUTE;
      if (active && limit.count >= 30)
        return {
          retry: Math.ceil(
            (limit.windowStartedAt.getTime() + MINUTE - now.getTime()) / 1000,
          ),
        };
      const values = {
        windowStartedAt: active && limit ? limit.windowStartedAt : now,
        count: active && limit ? limit.count + 1 : 1,
        updatedAt: now,
      };
      if (limit)
        await tx
          .update(smsAuthLimits)
          .set(values)
          .where(eq(smsAuthLimits.id, limit.id));
      else await tx.insert(smsAuthLimits).values({ bucket, ...values });
      const [challenge] = await tx
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, phoneHash(phone)))
        .for("update");
      if (
        !challenge ||
        !challenge.ready ||
        !challenge.codeHash ||
        challenge.attempts >= 3
      )
        return { accepted: false };
      const expired = challenge.expiresAt.getTime() <= Date.now();
      const accepted =
        !expired &&
        timingSafeEqual(
          Buffer.from(challenge.codeHash, "hex"),
          Buffer.from(codeHash(phone, code), "hex"),
        );
      const attempts = Math.min(3, challenge.attempts + 1);
      await tx
        .update(smsAuthChallenges)
        .set({
          attempts,
          ...(accepted || expired || attempts >= 3
            ? { codeHash: null, ready: false }
            : {}),
          updatedAt: now,
        })
        .where(eq(smsAuthChallenges.id, challenge.id));
      return { accepted };
    });
    if ("retry" in result) rateLimited(result.retry ?? 60);
    return result.accepted;
  }
  const peerKey = (headers?: Headers) =>
    headers?.get(CLIENT_HEADER) ?? "trusted-server";
  const plugin = phoneNumber({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 3,
    phoneNumberValidator: (phone) =>
      sendPhoneOtpSchema.safeParse({ phoneNumber: phone }).success,
    // This callback is retained for the plugin contract; its plaintext-storage
    // send endpoint is replaced below, and password/reset routes are not exposed.
    sendOTP: provider.sendOTP,
    verifyOTP: (data, ctx) =>
      verifyOTP(ctx?.body ?? data, peerKey(ctx?.headers)),
    signUpOnVerification: {
      getTempEmail: (phone) =>
        `${digest("sms:email", phone)}@phone.taff.invalid`,
      getTempName: () => "Taff",
    },
  });
  return {
    plugin: {
      ...plugin,
      // Persistent core budgets are authoritative. The plugin's additional
      // memory rule would unnecessarily halve logins behind one proxy peer.
      rateLimit: [],
      endpoints: {
        verifyPhoneNumber: plugin.endpoints.verifyPhoneNumber,
        sendPhoneNumberOTP: createAuthEndpoint(
          "/phone-number/send-otp",
          { method: "POST", body: sendPhoneOtpSchema },
          async (ctx) => {
            await sendOTP(ctx.body, peerKey(ctx.headers));
            return ctx.json({ status: true });
          },
        ),
      },
    },
    /** Only a trusted adapter supplies the socket peer; forwarded headers are replaced. */
    request(request: Request, peerAddress: string): Request {
      const headers = new Headers(request.headers);
      for (const name of [
        "forwarded",
        "x-forwarded-for",
        "x-real-ip",
        CLIENT_HEADER,
      ])
        headers.delete(name);
      headers.set("x-forwarded-for", peerAddress);
      headers.set(CLIENT_HEADER, digest("sms:peer", peerAddress));
      return new Request(request, { headers });
    },
  };
}
