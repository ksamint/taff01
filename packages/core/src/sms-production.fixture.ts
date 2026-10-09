/** Isolated process: Better Auth reads NODE_ENV when its modules initialize. */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { type Core, createCore } from "./index";

let core: Core | undefined;
let step = "production configuration";
try {
  assert.equal(process.env.NODE_ENV, "production");
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"));
  let sends = 0;
  core = createCore({
    databaseUrl,
    authUrl: "https://sms-production.test",
    authSecret: `production-sms-${randomUUID()}`,
    tokenPepper: `production-pepper-${randomUUID()}`,
    sms: {
      sendOTP: async () => {
        sends++;
      },
    },
  });
  assert.equal((await core.auth.$context).rateLimit.enabled, true);
  const actualPeer = "192.0.2.24";
  const call = (path: string, index: number) =>
    core!.handlePhoneAuth(
      new Request(`https://sms-production.test/api/auth/phone-number/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sms-production.test",
          "X-Forwarded-For": `198.51.100.${index + 1}`,
          "X-Real-IP": `203.0.113.${index + 1}`,
          "X-Taff-Sms-Peer": randomUUID(),
        },
        body: JSON.stringify({
          phoneNumber: `+86138${String(randomInt(0, 100_000_000)).padStart(8, "0")}`,
          ...(path === "verify" ? { code: "123456" } : {}),
        }),
      }),
      actualPeer,
    );
  step = "ten paid sends allowed";
  for (let i = 0; i < 10; i++)
    assert.equal((await call("send-otp", i)).status, 200);
  step = "same socket send budget rejects spoofed eleventh visitor";
  const sendLimit = await call("send-otp", 10);
  assert.equal(sendLimit.status, 429);
  assert.match(sendLimit.headers.get("Retry-After") ?? "", /^\d+$/);
  assert.equal(sends, 10);
  step = "thirty invalid verifications reach own persistent budget";
  for (let i = 0; i < 30; i++)
    assert.equal((await call("verify", i)).status, 400);
  step = "same socket verification budget rejects spoofed thirty-first visitor";
  const verifyLimit = await call("verify", 30);
  assert.equal(verifyLimit.status, 429);
  assert.match(verifyLimit.headers.get("Retry-After") ?? "", /^\d+$/);
  console.log(
    JSON.stringify({
      productionLimiter: true,
      acceptedSends: sends,
      invalidVerifications: 30,
      sharedPeerLimited: true,
    }),
  );
} catch (error) {
  // Assertion labels are fixed; never print auth/provider/database error bodies.
  console.error(
    JSON.stringify({
      step,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await core?.close();
}
