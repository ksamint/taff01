import { describe, expect, it } from "vitest";
import {
  agentProfileInputSchema,
  appendRunEventSchema,
  attachRunArtifactSchema,
  decideGrantSchema,
  inboxItemInputSchema,
  mcpFilesAttachArgs,
  reviewRunSchema,
  submitRunSchema,
} from "./index";

const uuid = "a6c451c0-5a8b-4c30-a2d4-d52cbb528a54";
describe("M3 shared input boundaries", () => {
  it("requires safe versions and nonnegative integer metrics", () => {
    const event = { version: 1, kind: "step", title: "Real event" };
    expect(appendRunEventSchema.parse(event)).toMatchObject({
      durationMs: 0,
      costMicros: 0,
      text: "",
    });
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        appendRunEventSchema.safeParse({ ...event, version: value }).success,
      ).toBe(false);
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        appendRunEventSchema.safeParse({ ...event, costMicros: value }).success,
      ).toBe(false);
  });
  it("rejects oversized artifacts, active source protocols and unknown input fields", () => {
    const input = {
      version: 1,
      name: "result.txt",
      mimeType: "text/plain",
      content: "Actual output",
    };
    expect(attachRunArtifactSchema.safeParse(input).success).toBe(true);
    expect(
      mcpFilesAttachArgs.safeParse({ ...input, runId: uuid }).success,
    ).toBe(true);
    for (const sourceUrl of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
    ])
      expect(
        attachRunArtifactSchema.safeParse({ ...input, sourceUrl }).success,
      ).toBe(false);
    expect(
      attachRunArtifactSchema.safeParse({
        ...input,
        content: "x".repeat(200001),
      }).success,
    ).toBe(false);
    expect(
      attachRunArtifactSchema.safeParse({ ...input, workspaceId: uuid })
        .success,
    ).toBe(false);
  });
  it("requires all checklist keys, limits artifact decisions and defaults to requesting review", () => {
    expect(
      submitRunSchema.parse({ version: 1, summary: "Completed" }).requestReview,
    ).toBe(true);
    const input = {
      version: 1,
      decision: "approve",
      checks: {
        matchesDescription: true,
        verifiable: true,
        withinPermissions: true,
      },
      items: [{ artifactId: uuid, decision: "approve" }],
    };
    expect(reviewRunSchema.safeParse(input).success).toBe(true);
    expect(
      reviewRunSchema.safeParse({
        ...input,
        checks: { matchesDescription: true },
      }).success,
    ).toBe(false);
    expect(
      reviewRunSchema.safeParse({
        ...input,
        items: Array.from({ length: 101 }, () => input.items[0]),
      }).success,
    ).toBe(false);
  });
  it("validates grant expiry shape, profile limits and nonempty Inbox mutations", () => {
    expect(
      decideGrantSchema.safeParse({
        decision: "allow",
        expiresAt: "not-a-date",
      }).success,
    ).toBe(false);
    expect(
      agentProfileInputSchema.safeParse({
        supervisorId: null,
        reviewPolicy: "ask_only",
        maxCostMicros: -1,
      }).success,
    ).toBe(false);
    expect(
      agentProfileInputSchema.parse({
        supervisorId: null,
        reviewPolicy: "always_review",
      }),
    ).toMatchObject({ maxDurationMs: null, maxCostMicros: null });
    expect(inboxItemInputSchema.safeParse({}).success).toBe(false);
    expect(
      inboxItemInputSchema.safeParse({ read: false, snoozedUntil: null })
        .success,
    ).toBe(true);
  });
});
