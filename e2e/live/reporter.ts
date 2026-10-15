import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";
export default class SafeReporter implements Reporter {
  rows: any[] = [];
  started = new Date().toISOString();
  onBegin(config: FullConfig, suite: any) {
    console.log(
      JSON.stringify({
        discovered: suite.allTests().length,
        event: "acceptance-start",
        tests: config.projects.map((p) => p.name),
      }),
    );
  }
  safeLocation(location: any) {
    return location &&
      typeof location.file === "string" &&
      Number.isSafeInteger(location.line) &&
      Number.isSafeInteger(location.column)
      ? {
          file: basename(location.file),
          line: location.line,
          column: location.column,
        }
      : undefined;
  }
  onTestEnd(test: TestCase, result: TestResult) {
    const failureLocations = result.errors
      .map(
        (error) =>
          this.safeLocation(error.location) ?? this.safeLocation(test.location),
      )
      .filter(Boolean);
    const row = {
      title: test.title,
      project: test.parent.project()?.name,
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      checks: [...test.annotations, ...(result.annotations ?? [])]
        .filter((a) => ["check", "skipped-step", "skip"].includes(a.type))
        .map((a) => ({ type: a.type, description: a.description })),
      ...(result.errors.length
        ? {
            error:
              "test-or-cleanup-failed; raw diagnostic intentionally suppressed",
            failureLocations,
          }
        : {}),
    };
    this.rows.push(row);
    console.log(
      JSON.stringify({
        event: "test",
        title: row.title,
        project: row.project,
        status: row.status,
        retry: result.retry,
        ...(failureLocations.length ? { failureLocations } : {}),
      }),
    );
  }
  onStdOut() {}
  onStdErr() {}
  onError(error: TestError) {
    const location = this.safeLocation(error.location);
    console.log(
      JSON.stringify({
        event: "harness-error",
        detail: "raw diagnostic suppressed",
        ...(location ? { location } : {}),
      }),
    );
  }
  onEnd(result: FullResult) {
    if (!this.rows.length) {
      console.log(
        JSON.stringify({ event: "discovery-finished", status: result.status }),
      );
      return;
    }
    const dir = process.env.RELEASE_REPORT_DIR ?? "reports";
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "acceptance-summary.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          startedAt: this.started,
          finishedAt: new Date().toISOString(),
          status: result.status,
          rows: this.rows,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        event: "acceptance-finished",
        status: result.status,
        report: path,
      }),
    );
  }
  printsToStdio() {
    return true;
  }
}
