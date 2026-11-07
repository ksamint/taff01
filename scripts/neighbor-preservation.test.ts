import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Container,
  compare,
  identity,
  loadReceipts,
  loadTaffEffects,
  type Receipt,
} from "./deploy/neighbor-preservation.mts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const old: Container = {
  name: "other-app",
  project: "other",
  service: "app",
  image: "old",
  reference: "app:old",
  startedAt: "2026-10-15T03:00:00Z",
  running: true,
  health: "healthy",
};
const next: Container = {
  ...old,
  image: "new",
  reference: "app:new",
  startedAt: "2026-10-15T04:00:00Z",
};
const proof: Receipt = {
  project: "other",
  source: "/other-publisher/events.ndjson",
  sha256: "a".repeat(64),
  verifiedAt: "2026-10-15T04:01:00Z",
  before: identity("old", old),
  after: identity("new", next),
};

describe("shared-host neighbour preservation", () => {
  let folder: string;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "taff-neighbour-"));
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it("rechecks the publisher source hash and rejects a Taff-owned source", () => {
    const source = join(folder, "publisher.json");
    writeFileSync(source, '{"ok":true}');
    const receipt = { ...proof, source, sha256: sha('{"ok":true}') };
    const path = join(folder, "receipts.json");
    writeFileSync(path, JSON.stringify([receipt]));
    expect(loadReceipts(path)).toEqual([receipt]);
    writeFileSync(source, '{"ok":false}');
    expect(() => loadReceipts(path)).toThrow("receipt changed");
    writeFileSync(
      path,
      JSON.stringify([{ ...receipt, source: "/srv/taff/forged.json" }]),
    );
    expect(() => loadReceipts(path)).toThrow("independent publisher source");
  });

  it("verifies the Taff mutation journal and treats a missing manifest as none", () => {
    const source = join(folder, "mutation.log");
    writeFileSync(source, "docker stop other-app");
    const path = join(folder, "effects.json");
    expect(loadTaffEffects(path)).toEqual([]);
    writeFileSync(
      path,
      JSON.stringify({
        source,
        sha256: sha("docker stop other-app"),
        verifiedAt: "2026-10-15T04:01:00Z",
        containerIds: ["old"],
      }),
    );
    expect(loadTaffEffects(path)).toEqual(["old"]);
    writeFileSync(source, "changed");
    expect(() => loadTaffEffects(path)).toThrow("journal changed");
  });

  it("passes unchanged containers", () => {
    expect(compare({ old }, { old }).status).toBe("passed");
  });

  it("needs independent proof for a replacement", () => {
    expect(compare({ old }, { new: next }).status).toBe("blocked");
    const result = compare({ old }, { new: next }, [proof]);
    expect(result.status).toBe("passed");
    expect(result.informational).toHaveLength(1);
  });

  it("never lets a receipt waive later drift", () => {
    expect(
      compare({ old }, { new: { ...next, health: "unhealthy" } }, [proof])
        .status,
    ).toBe("blocked");
  });

  it("lets a Taff effect override an independent receipt", () => {
    expect(compare({ old }, { new: next }, [proof], ["old"]).status).toBe(
      "failed",
    );
  });

  it("needs an exact receipt for a stopped active slot", () => {
    const stopped = { ...old, running: false, health: "unhealthy" };
    const stoppedProof = { ...proof, after: identity("old", stopped) };
    expect(compare({ old }, { old: stopped }, [stoppedProof]).status).toBe(
      "passed",
    );
    expect(compare({ old }, { old: stopped }).status).toBe("blocked");
  });

  it("blocks unproven additions and removals", () => {
    expect(compare({}, { new: next }).status).toBe("blocked");
    expect(compare({ old }, {}).status).toBe("blocked");
    expect(
      compare({}, { new: next }, [{ ...proof, before: null }]).status,
    ).toBe("passed");
    expect(compare({ old }, {}, [{ ...proof, after: null }]).status).toBe(
      "passed",
    );
  });

  it("grants no Taff or project-wide exemption", () => {
    for (const receipt of [
      { ...proof, project: "taff" },
      { ...proof, after: null },
      { ...proof, source: "" },
    ])
      expect(compare({ old }, { new: next }, [receipt]).status).toBe("blocked");
  });

  it("runs as a native CLI whose exit code follows the verdict", () => {
    const inputs = join(folder, "inputs.json");
    const write = (current: Record<string, Container>) =>
      writeFileSync(
        inputs,
        JSON.stringify({
          before: { old },
          current,
          independentReceipts: join(folder, "none.json"),
          taffEffects: join(folder, "none.json"),
        }),
      );
    const run = () =>
      execFileSync(
        process.execPath,
        ["scripts/deploy/neighbor-preservation.mts", inputs],
        { encoding: "utf8" },
      );
    write({ old });
    expect(JSON.parse(run()).status).toBe("passed");
    write({ new: next });
    expect(run).toThrow();
  });
});
