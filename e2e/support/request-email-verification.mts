import { createCore, userPrincipal } from "../../packages/core/src/index.ts";

// Test-only delivery capture: actual core-generated token, no production
// endpoint, SMTP traffic, direct identity updates or raw message logging.
const userId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(userId))
  throw new Error("Fixture user ID required");
const origin = new URL(process.env.AUTH_URL!);
if (!["localhost", "127.0.0.1"].includes(origin.hostname))
  throw new Error("Local test origin required");
let link: string | undefined;
const core = createCore({
  databaseUrl: process.env.DATABASE_URL!,
  authUrl: process.env.AUTH_URL!,
  authSecret: process.env.AUTH_SECRET!,
  tokenPepper: process.env.TOKEN_PEPPER!,
  email: {
    async send(message) {
      const found = message.text
        .split("\n")
        .find((line) => line.startsWith(`${origin.origin}/#verifyEmail=`));
      if (!found) throw new Error("Real verification link required");
      link = found;
      return "logged";
    },
  },
});
try {
  const result = await core.requestEmailVerification(userPrincipal(userId), {});
  if (result.delivery !== "logged" || !link)
    throw new Error("Actual verification delivery required");
  process.stdout.write(JSON.stringify({ link }));
} finally {
  await core.close();
}
