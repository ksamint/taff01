import { sendPhoneOtpSchema } from "@taff/schemas/base";

/** Canonical +86 number for a mainland mobile, else null. */
export function mainlandPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  const candidate = /^1\d{10}$/.test(compact)
    ? `+86${compact}`
    : /^861\d{10}$/.test(compact)
      ? `+${compact}`
      : compact;
  return sendPhoneOtpSchema.safeParse({ phoneNumber: candidate }).success
    ? candidate
    : null;
}
