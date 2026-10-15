import { expect, it } from "vitest";
import { agentBaseline, cleanupAgentBaseline } from "../e2e/live/agent-cleanup";

function fixture(mode = "normal") {
  const baseline = {
    supervisorId: "original-supervisor",
    reviewPolicy: "always_review" as const,
    maxDurationMs: 123,
    maxCostMicros: 456,
    permissions: [
      { capability: "files.attach" as const, decision: "ask" as const },
    ],
    grants: [{ id: "baseline", taskId: null, status: "allowed" as const }],
  };
  const current = {
    ...structuredClone(baseline),
    maxDurationMs: 999,
    grants: [
      ...structuredClone(baseline.grants),
      { id: "pending", taskId: null, status: "pending" },
      { id: "allowed", taskId: "our-task", status: "allowed" },
      { id: "other-null", taskId: null, status: "pending" },
      { id: "other-task", taskId: "unrelated-task", status: "allowed" },
      { id: "already-denied", taskId: null, status: "denied" },
    ],
  };
  const entries = [
    { kind: "grants", id: "pending" },
    { kind: "grants", id: "baseline" },
    { kind: "grants", id: "already-denied" },
    { kind: "tasks", id: "our-task" },
  ];
  const notes: { kind: string; id: string; status: string; error?: string }[] =
    [];
  const calls: { id: string; decision: string }[] = [];
  let reads = 0;
  const run = () =>
    cleanupAgentBaseline("agent", baseline, entries, {
      perform: async (kind, id, operation) => {
        try {
          await operation();
          notes.push({ kind, id, status: "cleaned" });
        } catch (error) {
          notes.push({
            kind,
            id,
            status: "cleanup-failed",
            error: (error as Error).message,
          });
        }
      },
      read: async () => {
        if (mode === "read-fails" && reads++ === 0)
          throw new Error("read-failed");
        return structuredClone(current) as Parameters<
          typeof cleanupAgentBaseline
        >[1];
      },
      decide: async (id, decision) => {
        calls.push({ id, decision });
        const grant = current.grants.find((row) => row.id === id)!;
        if (
          (decision === "deny"
            ? grant.status !== "pending"
            : grant.status !== "allowed") ||
          mode === "decision-fails"
        )
          throw new Error("409 conflict");
        const result = {
          ...grant,
          status: decision === "deny" ? "denied" : "revoked",
        };
        if (mode === "wrong-response")
          return grant as Parameters<
            typeof cleanupAgentBaseline
          >[1]["grants"][number];
        if (mode !== "not-persisted") Object.assign(grant, result);
        return result as Parameters<
          typeof cleanupAgentBaseline
        >[1]["grants"][number];
      },
      permission: async (permission) => {
        current.permissions = [permission] as typeof current.permissions;
      },
      settings: async (settings) => {
        if (mode !== "settings-not-persisted") Object.assign(current, settings);
      },
      fail: (step, code) => {
        throw new Error(`${step}:${code}`);
      },
    });
  return { baseline, current, notes, calls, run };
}

it("denies owned pending grants, revokes owned allowed grants, verifies terminal state and restores settings", async () => {
  const f = fixture();
  await f.run();
  expect(f.calls).toEqual([
    { id: "pending", decision: "deny" },
    { id: "allowed", decision: "revoke" },
  ]);
  expect(f.current.grants.map(({ id, status }) => [id, status])).toEqual([
    ["baseline", "allowed"],
    ["pending", "denied"],
    ["allowed", "revoked"],
    ["other-null", "pending"],
    ["other-task", "allowed"],
    ["already-denied", "denied"],
  ]);
  expect(agentBaseline(f.current)).toEqual(agentBaseline(f.baseline));
  expect(f.notes.every((note) => note.status === "cleaned")).toBe(true);
});

it.each(["decision-fails", "wrong-response", "not-persisted", "read-fails"])(
  "keeps %s blocking while still restoring the profile baseline",
  async (mode) => {
    const f = fixture(mode);
    await f.run();
    expect(
      f.notes.filter((note) => note.status === "cleanup-failed").length,
    ).toBeGreaterThan(0);
    expect(f.notes).toContainEqual({
      kind: "agent-settings",
      id: "agent",
      status: "cleaned",
    });
    expect(agentBaseline(f.current)).toEqual(agentBaseline(f.baseline));
    expect(
      f.calls.every((call) => ["deny", "revoke"].includes(call.decision)),
    ).toBe(true);
  },
);

it("does not accept an unpersisted profile restoration", async () => {
  const f = fixture("settings-not-persisted");
  await f.run();
  expect(f.notes).toContainEqual({
    kind: "agent-settings",
    id: "agent",
    status: "cleanup-failed",
    error: "agent.confirm-baseline:agent_baseline_not_restored",
  });
});

it("persists only semantic settings for private recovery evidence", () => {
  const f = fixture();
  expect(
    agentBaseline({
      ...f.baseline,
      token: "private-sentinel",
      history: ["raw"],
    } as typeof f.baseline),
  ).toEqual({
    supervisorId: "original-supervisor",
    reviewPolicy: "always_review",
    maxDurationMs: 123,
    maxCostMicros: 456,
    permissions: [{ capability: "files.attach", decision: "ask" }],
  });
});
