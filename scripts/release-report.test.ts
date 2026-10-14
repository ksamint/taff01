import { describe, expect, it } from "vitest";
import {
  parseItem,
  type ReleaseReport,
  redact,
  renderMarkdown,
  summarize,
} from "./release-report";

const report: ReleaseReport = {
  baseURL: "http://localhost:4200",
  startedAt: "2026-10-14T00:00:00.000Z",
  finishedAt: "2026-10-14T00:05:00.000Z",
  status: "failed",
  projects: ["phone-en", "desktop-en"],
  results: [
    {
      item: 1,
      title: "Sign-in and preferences",
      project: "phone-en",
      status: "passed",
      durationMs: 6100,
      skippedSteps: ["SMS sign-in: smsEnabled=false"],
      checks: [],
    },
    {
      item: 1,
      title: "Sign-in and preferences",
      project: "desktop-en",
      status: "skipped",
      durationMs: 0,
      skipReason: "not offered",
      skippedSteps: [],
      checks: [],
    },
    {
      item: 8,
      title: "MCP",
      project: "phone-en",
      status: "failed",
      durationMs: 20500,
      skippedSteps: [],
      checks: [
        { name: "tasks.create", ok: true },
        { name: "rate limit", ok: false },
      ],
      error: "boom",
    },
  ],
};

describe("release report", () => {
  it("redacts agent tokens, bearer headers, session cookies and passwords", () => {
    const text = [
      "token taff_abcDEF123_-xyz shown",
      "Authorization: Bearer taff_secretvalue123",
      "cookie better-auth.session_token=abc.def; Path=/",
      '{"password":"hunter22","name":"ok"}',
      "fill Release-pw-0f8e2a8c-1d2b-4c3d-9e8f-0a1b2c3d4e5f",
      "custom s3cr3t-value here",
    ].join("\n");
    const clean = redact(text, ["s3cr3t-value", undefined]);
    expect(clean).not.toMatch(/abcDEF123|secretvalue|abc\.def|hunter22/);
    expect(clean).not.toContain("0f8e2a8c");
    expect(clean).not.toContain("s3cr3t-value");
    expect(clean).toContain("taff_***");
    expect(clean).toContain("Bearer ***");
    expect(clean).toContain("better-auth.session_token=***");
    expect(clean).toContain('"password":"***"');
    expect(clean).toContain('"name":"ok"');
  });

  it("keeps the bare taff_ prefix the checklist asserts on", () => {
    expect(redact("starts with taff_")).toBe("starts with taff_");
  });

  it("reads item numbers from test titles", () => {
    expect(parseItem("[item 8] MCP")).toEqual({ item: 8, title: "MCP" });
    expect(parseItem("other")).toEqual({ item: 0, title: "other" });
  });

  it("summarizes and renders items × projects with skips and failures", () => {
    expect(summarize(report.results)).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      skippedSteps: 1,
    });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain("# R1 release checklist — FAILED");
    expect(markdown).toContain("| Item | phone-en | desktop-en |");
    expect(markdown).toContain(
      "| 1. Sign-in and preferences | pass 6.1s (1 step skipped) | skip 0.0s |",
    );
    expect(markdown).toContain("| 8. MCP | FAIL 20.5s | — |");
    expect(markdown).toContain("- Skipped: not offered");
    expect(markdown).toContain("- Step skipped: SMS sign-in: smsEnabled=false");
    expect(markdown).toContain("- 8. phone-en: 1/2 ok — failed: rate limit");
  });
});
