// Pure plan for `pnpm check` (scripts/check.mts): the local gate of
// docs/release-closeout.md check 1 as data, plus the argument, selection and
// report rules. No process or file access here, so vitest covers it.

export type CheckStep = {
  id: string;
  /** The command as a person would type it; shown in the report. */
  command: string;
  argv: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
  /** Runs while the local production-mode stack (`pnpm release:stack`) is up. */
  needsStack?: true;
};

const image = (id: string, file: string, target?: string): CheckStep => {
  const args = target ? ["--build-arg", `TARGET=${target}`] : [];
  const argv = ["docker", "build", "-f", file, ...args, "-t", id, "."] as const;
  return { id, command: argv.join(" "), argv };
};

/** Every step of the gate, in the order it runs. */
export const CHECK_STEPS: readonly CheckStep[] = [
  { id: "lint", command: "pnpm lint", argv: ["pnpm", "lint"] },
  { id: "typecheck", command: "pnpm typecheck", argv: ["pnpm", "typecheck"] },
  {
    id: "licence",
    command: "pnpm licence:check",
    argv: ["pnpm", "licence:check"],
  },
  { id: "rust", command: "pnpm rust:gate", argv: ["pnpm", "rust:gate"] },
  { id: "test", command: "pnpm test", argv: ["pnpm", "test"] },
  {
    id: "db-migrate",
    command: "pnpm db:migrate",
    argv: ["pnpm", "db:migrate"],
  },
  { id: "db-seed", command: "pnpm db:seed", argv: ["pnpm", "db:seed"] },
  { id: "build", command: "pnpm build", argv: ["pnpm", "build"] },
  {
    id: "build-server",
    command: "pnpm build:server",
    argv: ["pnpm", "build:server"],
  },
  { id: "budget", command: "pnpm perf:budget", argv: ["pnpm", "perf:budget"] },
  { id: "e2e", command: "pnpm e2e", argv: ["pnpm", "e2e"] },
  {
    id: "ssr",
    command:
      'SSR_PRODUCTION=1 pnpm e2e e2e/ssr-session.spec.ts --grep "production SSR HTML is private"',
    argv: [
      "pnpm",
      "e2e",
      "e2e/ssr-session.spec.ts",
      "--grep",
      "production SSR HTML is private",
    ],
    env: { SSR_PRODUCTION: "1" },
    needsStack: true,
  },
  {
    id: "checklist",
    command: "pnpm release:checklist",
    argv: ["pnpm", "release:checklist"],
    needsStack: true,
  },
  {
    id: "mcp",
    command: "pnpm mcp:smoke",
    argv: ["pnpm", "mcp:smoke"],
    needsStack: true,
  },
  image("taff-check-api", "deploy/Dockerfile.server", "api"),
  image("taff-check-worker", "deploy/Dockerfile.server", "worker"),
  image("taff-check-web", "deploy/Dockerfile.web"),
  image("taff-check-render", "deploy/Dockerfile.render"),
];

export type CheckOptions = {
  only: string[];
  skip: string[];
  allowDirty: boolean;
  list: boolean;
};

const known = new Set(CHECK_STEPS.map((step) => step.id));

function ids(flag: string, value: string | undefined): string[] {
  if (!value) throw new Error(`${flag} needs a comma-separated list of steps`);
  const list = value.split(",").filter(Boolean);
  const unknown = list.filter((id) => !known.has(id));
  if (unknown.length > 0)
    throw new Error(`Unknown step: ${unknown.join(", ")}; see --list`);
  return list;
}

export function parseCheckArgs(argv: readonly string[]): CheckOptions {
  const options: CheckOptions = {
    only: [],
    skip: [],
    allowDirty: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--only") options.only = ids(arg, argv[++i]);
    else if (arg === "--skip") options.skip = ids(arg, argv[++i]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.only.length > 0 && options.skip.length > 0)
    throw new Error("Use --only or --skip, not both");
  return options;
}

/** Steps left out by --only or --skip; they are reported as not run. */
export function leftOut(options: CheckOptions): Set<string> {
  if (options.only.length > 0)
    return new Set(
      CHECK_STEPS.filter((step) => !options.only.includes(step.id)).map(
        (step) => step.id,
      ),
    );
  return new Set(options.skip);
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The gate migrates, seeds and writes test data. It may only ever do that on
 * this machine, so every database URL it is given must be loopback.
 */
export function remoteDatabases(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return ["DATABASE_URL", "TEST_DATABASE_URL"].filter((name) => {
    const value = env[name];
    if (!value) return false;
    try {
      return !LOOPBACK.has(new URL(value).hostname);
    } catch {
      return true;
    }
  });
}

export type StepStatus = "passed" | "failed" | "not run";

export type StepResult = {
  id: string;
  command: string;
  status: StepStatus;
  seconds: number;
  /** Why a step did not run. */
  reason?: string;
};

export type CheckReport = {
  /** `git rev-parse HEAD^{tree}`: what the result is bound to. */
  tree: string;
  commit: string;
  /** False when the working tree differed from the commit (--allow-dirty). */
  clean: boolean;
  startedAt: string;
  node: string;
  /** "partial": nothing failed, but not every step ran. Never a full pass. */
  result: "passed" | "failed" | "partial";
  steps: StepResult[];
};

export function checkResult(
  steps: readonly StepResult[],
  clean: boolean,
): CheckReport["result"] {
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (!clean || steps.some((step) => step.status === "not run"))
    return "partial";
  return "passed";
}

/** The table that goes into a pull request body or a milestone. */
export function checkMarkdown(report: CheckReport): string {
  const rows = report.steps.map(
    (step) =>
      `| \`${step.command.replaceAll("|", "\\|")}\` | ${step.status}${
        step.reason ? ` (${step.reason})` : ""
      } | ${step.status === "not run" ? "" : `${step.seconds.toFixed(0)} s`} |`,
  );
  return [
    `Tree: \`${report.tree}\` (commit \`${report.commit}\`, ${
      report.clean ? "clean checkout" : "working tree had changes"
    }), Node ${report.node}. Result: **${report.result}**.`,
    "",
    "| Command | Result | Time |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}
