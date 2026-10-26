import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import SafeReporter from "../e2e/live/reporter";
import {
  failureCategory,
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
      "v021-feature-gaps.spec.ts",
      "--retries=1",
    ]),
  ).toHaveLength(8);
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

it("cleanup accepts an explicitly journaled null-task grant but preserves baseline and unrelated grants", () => {
  const entries = [{ kind: "grants", id: "created-grant" }];
  const created = { id: "created-grant", taskId: null, status: "pending" };
  expect(ownsGrant(created, [], entries)).toBe(true);
  expect(ownsGrant({ ...created, status: "allowed" }, [], entries)).toBe(true);
  expect(ownsGrant(created, [{ id: "created-grant" }], entries)).toBe(false);
  expect(ownsGrant({ ...created, id: "unrelated" }, [], entries)).toBe(false);
  expect(ownsGrant({ ...created, status: "revoked" }, [], entries)).toBe(false);
});

it("discovers all 147 applicable public cases without credentials or browser activity", () => {
  const parent = mkdtempSync(join(tmpdir(), "taff-live-discovery-"));
  try {
    const discovery = spawnSync(
      process.execPath,
      ["e2e/live/run.mjs", "--list"],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          PATH: process.env.PATH,
          RELEASE_BASE_URL: "https://taff.apuch.cn",
          RELEASE_REPORT_DIR: parent,
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    expect(discovery.error).toBeUndefined();
    expect(discovery.status, "sanitized discovery must exit successfully").toBe(
      0,
    );
    const events = discovery.stdout
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
    expect(
      events.find((entry) => entry.event === "acceptance-start"),
    ).toMatchObject({ discovered: 147 });
    expect(
      events.find((entry) => entry.event === "acceptance-finished"),
    ).toMatchObject({ status: "passed" });
  } finally {
    rmSync(parent, { recursive: true });
  }
}, 20000);

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

it("keeps transport diagnostics categorical even with credentials in the exception", () => {
  for (const [message, category] of [
    [
      "apiRequestContext.get: Timeout 30000ms exceeded secret@example.test",
      "timeout",
    ],
    ["read ECONNRESET https://user:secret@example.test", "econnreset"],
    [
      "net::ERR_CONNECTION_CLOSED https://example.test/token",
      "browser_network_error",
    ],
    ["unexpected secret body", "transport_or_local_error"],
  ])
    expect(failureCategory(new Error(message))).toBe(category);
});
