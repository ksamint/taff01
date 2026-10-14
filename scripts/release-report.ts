// Pure helpers for the R1 release checklist report (e2e/release/reporter.ts):
// one row per checklist item × Playwright project, rendered as JSON and
// Markdown with secrets removed. Kept free of Playwright imports so vitest
// covers it.

export type ReleaseStatus = "passed" | "failed" | "skipped";

export type ReleaseResult = {
  /** Checklist item number, 1–8 (plan §6.0). */
  item: number;
  title: string;
  project: string;
  status: ReleaseStatus;
  durationMs: number;
  /** Why the whole item was skipped. */
  skipReason?: string;
  /** Sub-steps skipped with a reason while the item ran. */
  skippedSteps: string[];
  /** Named checks the item recorded, e.g. the MCP round trip. */
  checks: { name: string; ok: boolean }[];
  error?: string;
};

export type ReleaseReport = {
  baseURL: string;
  startedAt: string;
  finishedAt: string;
  status: "passed" | "failed";
  projects: string[];
  results: ReleaseResult[];
};

const SECRET_PATTERNS: [RegExp, string][] = [
  // Agent tokens are shown once; only their `taff_` prefix may be reported.
  [/\btaff_[A-Za-z0-9_-]{6,}/g, "taff_***"],
  [/\bBearer\s+[^\s"',]+/gi, "Bearer ***"],
  // Passwords the checklist generates for its fresh accounts.
  [/\bRelease-pw-[0-9a-f-]{36}/g, "***"],
  [/\b((?:__Secure-)?better-auth\.session_token)=[^;\s"']+/g, "$1=***"],
  [/("?(?:password|token|secret|cookie)"?\s*[:=]\s*)"[^"]*"/gi, '$1"***"'],
];

/** Removes tokens, cookies and the given secret values from report text. */
export function redact(
  text: string,
  secrets: readonly (string | undefined)[] = [],
) {
  let value = text;
  for (const secret of secrets)
    if (secret && secret.length >= 4) value = value.split(secret).join("***");
  for (const [pattern, replacement] of SECRET_PATTERNS)
    value = value.replace(pattern, replacement);
  return value;
}

/** Reads `[item N] title` from a test title. */
export function parseItem(title: string) {
  const match = /^\[item (\d+)\]\s*(.*)$/.exec(title);
  return match
    ? { item: Number(match[1]), title: match[2] }
    : { item: 0, title };
}

export function summarize(results: readonly ReleaseResult[]) {
  const count = (status: ReleaseStatus) =>
    results.filter((result) => result.status === status).length;
  return {
    passed: count("passed"),
    failed: count("failed"),
    skipped: count("skipped"),
    skippedSteps: results.reduce(
      (total, result) => total + result.skippedSteps.length,
      0,
    ),
  };
}

const symbol = { passed: "pass", failed: "FAIL", skipped: "skip" } as const;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderMarkdown(report: ReleaseReport) {
  const items = [...new Set(report.results.map((result) => result.item))]
    .sort((a, b) => a - b)
    .map((item) => ({
      item,
      title: report.results.find((result) => result.item === item)?.title ?? "",
    }));
  const find = (item: number, project: string) =>
    report.results.find(
      (result) => result.item === item && result.project === project,
    );
  const totals = summarize(report.results);
  const lines = [
    `# R1 release checklist — ${report.status === "passed" ? "passed" : "FAILED"}`,
    "",
    `- Base URL: ${report.baseURL}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Results: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped; ${totals.skippedSteps} sub-steps skipped with a reason`,
    "",
    `| Item | ${report.projects.join(" | ")} |`,
    `| --- | ${report.projects.map(() => "---").join(" | ")} |`,
    ...items.map(
      ({ item, title }) =>
        `| ${item}. ${cell(title)} | ${report.projects
          .map((project) => {
            const result = find(item, project);
            if (!result) return "—";
            const note = result.skippedSteps.length
              ? ` (${result.skippedSteps.length} step skipped)`
              : "";
            return `${symbol[result.status]} ${seconds(result.durationMs)}${note}`;
          })
          .join(" | ")} |`,
    ),
    "",
  ];
  const notes = report.results.filter(
    (result) => result.skipReason || result.skippedSteps.length || result.error,
  );
  if (notes.length) {
    lines.push("## Skips and failures", "");
    for (const result of notes) {
      lines.push(`### ${result.item}. ${result.title} — ${result.project}`, "");
      if (result.skipReason) lines.push(`- Skipped: ${result.skipReason}`);
      for (const step of result.skippedSteps)
        lines.push(`- Step skipped: ${step}`);
      if (result.error)
        lines.push("- Failure:", "", "```", result.error, "```");
      lines.push("");
    }
  }
  const withChecks = report.results.filter((result) => result.checks.length);
  if (withChecks.length) {
    lines.push("## Recorded checks", "");
    for (const result of withChecks) {
      const failed = result.checks.filter((check) => !check.ok);
      lines.push(
        `- ${result.item}. ${result.project}: ${result.checks.length - failed.length}/${result.checks.length} ok${failed.length ? ` — failed: ${failed.map((check) => check.name).join("; ")}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
