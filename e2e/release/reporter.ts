import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import {
  parseItem,
  type ReleaseReport,
  type ReleaseResult,
  redact,
  renderMarkdown,
} from "../../scripts/release-report";

/**
 * Writes release-reports/checklist-<timestamp>.{json,md}: every checklist
 * item × project with pass, fail or skip-with-reason and its duration. Tests
 * add `skipped-step` and `check` annotations; nothing else from a test is
 * copied, and every string goes through `redact`.
 */
export default class ReleaseReporter implements Reporter {
  private startedAt = new Date();
  private projects: string[] = [];
  private results = new Map<string, ReleaseResult>();
  private secrets = [
    process.env.RELEASE_DEMO_PASSWORD,
    process.env.DEMO_PASSWORD,
    process.env.AUTH_SECRET,
    process.env.TOKEN_PEPPER,
  ];

  onBegin(config: FullConfig, _suite: Suite) {
    this.startedAt = new Date();
    this.projects = config.projects.map((project) => project.name);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? "";
    const { item, title } = parseItem(test.title);
    const clean = (text: string) => redact(text, this.secrets);
    // Runtime annotations may appear on both the test and the result.
    const annotations = [
      ...new Map(
        [...test.annotations, ...(result.annotations ?? [])].map((note) => [
          `${note.type}\u0000${note.description ?? ""}`,
          note,
        ]),
      ).values(),
    ];
    const skip = annotations.find((note) => note.type === "skip");
    const status =
      result.status === "skipped"
        ? "skipped"
        : result.status === "passed"
          ? "passed"
          : "failed";
    const error = result.errors
      .map((entry) => entry.message ?? entry.value ?? "")
      .join("\n")
      // Strip ANSI colour codes from Playwright's messages.
      .replace(/\u001b\[[0-9;]*m/g, "")
      .slice(0, 4000);
    // Retries replace the earlier attempt for the same item and project.
    this.results.set(`${item}:${project}`, {
      item,
      title: clean(title),
      project,
      status,
      durationMs: result.duration,
      ...(status === "skipped"
        ? { skipReason: clean(skip?.description ?? "skipped") }
        : {}),
      skippedSteps: annotations
        .filter((note) => note.type === "skipped-step")
        .map((note) => clean(note.description ?? "")),
      checks: annotations
        .filter((note) => note.type === "check")
        .map((note) => {
          const [ok, ...name] = (note.description ?? "").split("|");
          return { name: clean(name.join("|")), ok: ok === "ok" };
        }),
      ...(error && status === "failed" ? { error: clean(error) } : {}),
    });
  }

  onEnd(result: FullResult) {
    // `--list` and empty selections run nothing worth reporting.
    if (!this.results.size) return;
    const results = [...this.results.values()].sort(
      (a, b) =>
        a.item - b.item ||
        this.projects.indexOf(a.project) - this.projects.indexOf(b.project),
    );
    const report: ReleaseReport = {
      baseURL: process.env.RELEASE_BASE_URL ?? "http://localhost:3000",
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status:
        result.status === "passed" &&
        results.every((entry) => entry.status !== "failed")
          ? "passed"
          : "failed",
      projects: this.projects,
      results,
    };
    const dir = resolve(process.env.RELEASE_REPORT_DIR ?? "release-reports");
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.replace(/[:.]/g, "-");
    const base = join(dir, `checklist-${stamp}`);
    writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${base}.md`, renderMarkdown(report));
    console.log(`Release checklist report: ${base}.{json,md}`);
  }

  printsToStdio() {
    return false;
  }
}
