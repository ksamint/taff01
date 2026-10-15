import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import SafeReporter from "../e2e/live/reporter";
import {
  freshLiveReport,
  ownsGrant,
  validateLiveArgs,
} from "../e2e/live/safety.mjs";

it("allows targeting while rejecting every artifact/config/parallelism override", () => {
  expect(
    validateLiveArgs([
      "--list",
      "--project=phone-en",
      "--grep",
      "keyboard|evidence",
      "--repeat-each=3",
      "mind.spec.ts",
      "--retries=1",
    ]),
  ).toHaveLength(7);
  for (const flag of [
    "--trace=on",
    "--reporter=list",
    "-c",
    "--config=other.ts",
    "--ui",
    "--debug",
    "--workers=2",
    "--output=public",
    "--grep-invert=anything",
    "--retries=2",
    "--timeout=999999",
  ])
    expect(() => validateLiveArgs([flag])).toThrow();
});
it("keeps first attempt and failed/discovery outputs in separate directories", () => {
  const parent = mkdtempSync(join(tmpdir(), "taff-live-test-"));
  try {
    const first = freshLiveReport(parent),
      retry = freshLiveReport(parent);
    expect(first).not.toBe(retry);
    expect(existsSync(first) && existsSync(retry)).toBe(true);
  } finally {
    rmSync(parent, { recursive: true });
  }
});
it("cleanup revokes only new grants scoped to tasks owned by this run", () => {
  const entries = [{ kind: "tasks", id: "ours" }];
  expect(
    ownsGrant({ id: "new", taskId: "ours", status: "allowed" }, [], entries),
  ).toBe(true);
  for (const grant of [
    { id: "new", taskId: "unrelated", status: "allowed" },
    { id: "new", taskId: null, status: "pending" },
    { id: "old", taskId: "ours", status: "allowed" },
    { id: "new", taskId: "ours", status: "revoked" },
  ])
    expect(ownsGrant(grant, [{ id: "old" }], entries)).toBe(false);
});

it("writes a failed receipt even when startup discovers no cases", () => {
  const parent = mkdtempSync(join(tmpdir(), "taff-live-startup-"));
  const previous = process.env.RELEASE_REPORT_DIR;
  try {
    process.env.RELEASE_REPORT_DIR = parent;
    new SafeReporter().onEnd({
      status: "failed",
      startTime: new Date(),
      duration: 0,
    });
    expect(
      JSON.parse(readFileSync(join(parent, "acceptance-summary.json"), "utf8")),
    ).toMatchObject({ status: "failed", rows: [] });
  } finally {
    if (previous === undefined) delete process.env.RELEASE_REPORT_DIR;
    else process.env.RELEASE_REPORT_DIR = previous;
    rmSync(parent, { recursive: true });
  }
});
