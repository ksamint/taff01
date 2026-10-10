import {
  administrationProvisionSchema,
  signInSchema,
  signUpSchema,
  usernameSignInSchema,
} from "@taff/schemas";
import { usernameSignInSchema as leafUsernameSchema } from "@taff/schemas/base";
import { describe, expect, it } from "vitest";
import { type Actor, can } from "./permissions";

describe("username and privileged administration contracts", () => {
  it("shares username login validation and keeps stronger public registration", () => {
    expect(leafUsernameSchema).toBe(usernameSignInSchema);
    expect(
      usernameSignInSchema.parse({ username: "  Ab_1.  ", password: "test12" })
        .username,
    ).toBe("Ab_1.");
    expect(
      signInSchema.safeParse({ email: "test@example.test", password: "test12" })
        .success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({
        name: "Test",
        email: "test@example.test",
        password: "test12",
        username: "ab",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        name: "Test",
        email: "test@example.test",
        password: "test1234",
        username: "ab",
      }).success,
    ).toBe(true);
    for (const username of ["a", "x-y", "侍天", "x@x", "x".repeat(31)])
      expect(
        usernameSignInSchema.safeParse({ username, password: "test12" })
          .success,
      ).toBe(false);
    expect(
      signUpSchema.safeParse({
        name: "Test",
        email: "test@example.test",
        password: "test1234",
        systemAdmin: true,
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        name: "Test",
        email: "test@example.test",
        password: "test1234",
        id: "provisioned-org-admin:forged",
      }).success,
    ).toBe(false);
  });
  it("rejects unbounded or duplicated runtime input and public-style privilege flags", () => {
    expect(
      administrationProvisionSchema.safeParse({
        workspaceNames: ["Test", "Test"],
        systemAdminPhones: [],
        orgAdmin: { username: "ab", password: "test12", workspaceName: "Test" },
      }).success,
    ).toBe(false);
  });
  it.each([
    ["real person admin in own workspace", "person", "admin", "own", true],
    ["org admin cannot cross workspace", "person", "admin", "other", false],
    [
      "ordinary person flag cannot bypass role",
      "person",
      "member",
      "own",
      false,
    ],
    ["agent admin cannot manage organization", "agent", "admin", "own", false],
  ] as const)("%s", (_name, kind, role, workspaceId, expected) => {
    const actor: Actor & { systemAdmin: boolean } = {
      id: "real-member",
      workspaceId: "own",
      userId: kind === "person" ? "real-user" : null,
      name: "Test",
      kind,
      role,
      systemAdmin: true,
    };
    expect(can(actor, "workspace:manage", { workspaceId })).toBe(expected);
  });
});
