import { describe, expect, it } from "vitest";
import * as email from "./email-verification";
import * as root from "./index";

describe("shared email ownership contract", () => {
  it("exports the same strict validators and normalizes only token input", () => {
    expect(root.emailVerificationRequestSchema).toBe(
      email.emailVerificationRequestSchema,
    );
    expect(root.emailVerificationConsumeSchema).toBe(
      email.emailVerificationConsumeSchema,
    );
    expect(email.emailVerificationRequestSchema.parse({})).toEqual({});
    expect(
      email.emailVerificationRequestSchema.safeParse({
        email: "other@example.test",
      }).success,
    ).toBe(false);
    expect(
      email.emailVerificationConsumeSchema.parse({ token: " proof " }),
    ).toEqual({ token: "proof" });
    for (const input of [
      { token: "" },
      { token: "x".repeat(4097) },
      { token: "proof", userId: "other" },
      { token: "proof", callbackURL: "https://other.example.test" },
    ])
      expect(
        email.emailVerificationConsumeSchema.safeParse(input).success,
      ).toBe(false);
  });
  it("keeps authoritative delivery states and verification-required failures within shared schemas", () => {
    for (const delivery of ["sent", "logged", "failed", null])
      expect(
        email.emailVerificationRequestResultSchema.parse({
          emailVerified: delivery === null,
          delivery,
        }),
      ).toEqual({ emailVerified: delivery === null, delivery });
    expect(
      email.emailVerificationRequestResultSchema.safeParse({
        emailVerified: false,
        delivery: "delivered",
      }).success,
    ).toBe(false);
    expect(
      root.errorSchema.parse({ error: "email_verification_required" }),
    ).toEqual({ error: "email_verification_required" });
  });
});
