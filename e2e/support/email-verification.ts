import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export async function verificationLink(userId: string): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await promisify(execFile)(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "e2e/support/request-email-verification.mts",
        userId,
      ],
      { timeout: 20_000, maxBuffer: 64_000 },
    ));
  } catch {
    throw new Error("Email verification fixture failed");
  }
  const value = JSON.parse(stdout) as { link: string };
  const link = new URL(value.link);
  if (
    link.origin !== new URL(process.env.AUTH_URL!).origin ||
    !link.hash.startsWith("#verifyEmail=")
  )
    throw new Error("Expected private verification fragment");
  return link.href;
}

/** Non-UI setup for unrelated role/cache tests; consumes the genuine challenge
 * through the authenticated API rather than editing emailVerified directly. */
export async function verifyTestEmail(page: Page, userId: string) {
  const status = await page.request.get("/api/me/email-verification");
  expect(status.status()).toBe(200);
  if ((await status.json()).emailVerified) return;
  const link = new URL(await verificationLink(userId));
  const response = await page.request.post(
    "/api/me/email-verification/verify",
    {
      data: {
        token: new URLSearchParams(link.hash.slice(1)).get("verifyEmail"),
      },
    },
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ emailVerified: true });
}
