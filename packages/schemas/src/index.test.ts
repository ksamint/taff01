import { describe, expect, it } from "vitest";
import { createTaskSchema, profileSchema, signInSchema } from "./index";

const id = "00000000-0000-4000-8000-000000000001";
describe("API trust boundaries", () => {
  it("trims task titles, defaults worker and preserves omitted due date", () => {
    expect(
      createTaskSchema.parse({
        workspaceId: id,
        ownerId: id,
        title: "  Task  ",
      }),
    ).toEqual({
      workspaceId: id,
      ownerId: id,
      title: "Task",
      workerId: null,
    });
  });
  it.each([
    { title: " " },
    { title: "x".repeat(201) },
    { workerId: "agent-name" },
    { dueAt: "2026-10-08" },
    { ownerId: "not-uuid" },
    { status: "done" },
  ])("rejects invalid or injected task fields %j", (override) => {
    expect(
      createTaskSchema.safeParse({
        workspaceId: id,
        ownerId: id,
        title: "Task",
        ...override,
      }).success,
    ).toBe(false);
  });
  it("accepts real time zones and rejects unknown locales/zones", () => {
    expect(
      profileSchema.safeParse({ locale: "zh-CN", tz: "Asia/Singapore" })
        .success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ locale: "en", tz: "invalid" }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ locale: "fr", tz: "UTC" }).success).toBe(
      false,
    );
  });
  it("rejects invalid credentials and unknown auth fields", () => {
    expect(
      signInSchema.safeParse({ email: "invalid", password: "password123" })
        .success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({ email: "a@example.com", password: "short" })
        .success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({
        email: "a@example.com",
        password: "password123",
        role: "admin",
      }).success,
    ).toBe(false);
  });
});
