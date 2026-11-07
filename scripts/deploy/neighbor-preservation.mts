/**
 * Compare sanitized Docker snapshots with independently verified rollout receipts.
 *
 * The caller collects receipts from the other project's publisher (not from
 * Docker labels alone), verifies their hashes and exact effects, and retains
 * the originals privately. No container environment is needed. Unknown drift
 * blocks acceptance.
 *
 *   node scripts/deploy/neighbor-preservation.mts <inputs.json>
 *
 * inputs.json: {before, current, independentReceipts, taffEffects}, where the
 * last two are paths. Exit 0 only when the status is "passed".
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";

const FIELDS = [
  "name",
  "project",
  "service",
  "image",
  "reference",
  "created",
  "startedAt",
  "finishedAt",
  "running",
  "health",
] as const;

export type Container = Record<string, unknown> & { name: string };
export type Snapshot = Record<string, Container>;
export type Identity = Record<string, unknown>;
export type Receipt = {
  project?: string | null;
  source?: string;
  sha256?: string;
  verifiedAt?: string;
  before?: Identity | null;
  after?: Identity | null;
};
type Change = {
  name: string;
  before: Identity | null;
  after: Identity | null;
  evidence?: Receipt;
};
export type Report = {
  unchanged: number;
  informational: Change[];
  taffCaused: Change[];
  unexplained: Change[];
  status: "passed" | "blocked" | "failed";
};

export function identity(containerId: string | null, row: Container): Identity {
  const result: Identity = { id: containerId };
  for (const key of FIELDS) result[key] = row[key] ?? null;
  return result;
}

const independent = (receipt: Receipt, project: unknown) =>
  receipt.project === project &&
  receipt.project != null &&
  receipt.project !== "taff" &&
  Boolean(receipt.source) &&
  Boolean(receipt.verifiedAt) &&
  typeof receipt.sha256 === "string" &&
  receipt.sha256.length === 64;

/**
 * Return attributable failures separately from unknown drift and rollouts.
 *
 * Receipts bind exact before/after snapshots; never waive a whole project or a
 * time interval. taffEffects are container IDs from the publisher mutation
 * journal. Missing attribution remains blocking, without claiming Taff caused it.
 */
export function compare(
  before: Snapshot,
  current: Snapshot,
  receipts: readonly Receipt[] = [],
  taffEffects: readonly string[] = [],
): Report {
  const result: Omit<Report, "status"> = {
    unchanged: 0,
    informational: [],
    taffCaused: [],
    unexplained: [],
  };
  const matched = new Set<string>();
  for (const [oldId, old] of Object.entries(before)) {
    let newId: string | null = oldId;
    let next: Container | null = current[oldId] ?? null;
    if (next === null) {
      const replacements = Object.entries(current).filter(
        ([, row]) => row.name === old.name,
      );
      [newId, next] =
        replacements.length === 1 ? replacements[0] : [null, null];
    }
    if (newId !== null) matched.add(newId);
    const previous = identity(oldId, old);
    const actual = next === null ? null : identity(newId, next);
    if (isDeepStrictEqual(actual, previous)) {
      result.unchanged += 1;
      continue;
    }
    const change: Change = { name: old.name, before: previous, after: actual };
    if (
      taffEffects.includes(oldId) ||
      (newId !== null && taffEffects.includes(newId))
    ) {
      result.taffCaused.push(change);
      continue;
    }
    const proof = receipts.find(
      (receipt) =>
        independent(receipt, old.project) &&
        isDeepStrictEqual(receipt.before, previous) &&
        isDeepStrictEqual(receipt.after ?? null, actual),
    );
    if (proof) result.informational.push({ ...change, evidence: proof });
    else result.unexplained.push(change);
  }
  // Include additions, including unexpected project renames. They also require
  // an exact independent receipt; labels are not evidence of the initiator.
  for (const [newId, next] of Object.entries(current)) {
    if (matched.has(newId) || newId in before) continue;
    const actual = identity(newId, next);
    const change: Change = { name: next.name, before: null, after: actual };
    const proof = receipts.find(
      (receipt) =>
        independent(receipt, next.project) &&
        receipt.before == null &&
        isDeepStrictEqual(receipt.after, actual),
    );
    if (taffEffects.includes(newId)) result.taffCaused.push(change);
    else if (proof) result.informational.push({ ...change, evidence: proof });
    else result.unexplained.push(change);
  }
  return {
    ...result,
    status: result.taffCaused.length
      ? "failed"
      : result.unexplained.length
        ? "blocked"
        : "passed",
  };
}

const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/** Load operator-verified exact effects and recheck original publisher bytes. */
export function loadReceipts(path: string): Receipt[] {
  if (!existsSync(path)) return [];
  const receipts = JSON.parse(readFileSync(path, "utf8")) as Receipt[];
  for (const receipt of receipts) {
    const source = String(receipt.source ?? "");
    if (!isAbsolute(source) || source.startsWith("/srv/taff/"))
      throw new Error("independent publisher source required");
    if (sha256(source) !== receipt.sha256)
      throw new Error("independent publisher receipt changed");
  }
  return receipts;
}

/**
 * Read confirmed Taff effects, corroborated by a private mutation journal.
 *
 * Simultaneous Docker changes alone are insufficient attribution. The operator
 * confirms the explicit command targets from the publisher log before writing
 * this file; unexplained changes block until that investigation is complete.
 */
export function loadTaffEffects(path: string): string[] {
  if (!existsSync(path)) return [];
  const receipt = JSON.parse(readFileSync(path, "utf8")) as {
    source: string;
    sha256: string;
    verifiedAt?: string;
    containerIds?: string[];
  };
  if (sha256(receipt.source) !== receipt.sha256)
    throw new Error("Taff mutation journal changed");
  if (!receipt.verifiedAt || !receipt.containerIds?.length)
    throw new Error("confirmed Taff effects required");
  return receipt.containerIds;
}

if (import.meta.main) {
  const inputs = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
    before: Snapshot;
    current: Snapshot;
    independentReceipts: string;
    taffEffects: string;
  };
  // Receipt paths, so an unverified JSON array cannot bypass the hashes.
  const report = compare(
    inputs.before,
    inputs.current,
    loadReceipts(inputs.independentReceipts),
    loadTaffEffects(inputs.taffEffects),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "passed" ? 0 : 1;
}
