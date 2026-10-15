import type { AgentProfile, Grant } from "../../packages/schemas/src/index";
import { ownsGrant } from "./safety.mjs";

type GrantState = Pick<Grant, "id" | "taskId" | "status">;
type Settings = Pick<
  AgentProfile,
  | "supervisorId"
  | "reviewPolicy"
  | "maxDurationMs"
  | "maxCostMicros"
  | "permissions"
>;
type Profile = Settings & { grants: GrantState[] };
type Operations = {
  perform(
    kind: string,
    id: string,
    operation: () => Promise<void>,
  ): Promise<void>;
  read(): Promise<Profile>;
  decide(id: string, decision: "deny" | "revoke"): Promise<GrantState>;
  permission(permission: Settings["permissions"][number]): Promise<unknown>;
  settings(settings: Omit<Settings, "permissions">): Promise<unknown>;
  fail(step: string, code: string): never;
};

/** Semantic recovery evidence only; never persist grants, tokens or raw profiles. */
export function agentBaseline(profile: Settings): Settings {
  return {
    supervisorId: profile.supervisorId,
    reviewPolicy: profile.reviewPolicy,
    maxDurationMs: profile.maxDurationMs,
    maxCostMicros: profile.maxCostMicros,
    permissions: profile.permissions.map(({ capability, decision }) => ({
      capability,
      decision,
    })),
  };
}

/** Failures remain journaled, while a failed grant cannot skip settings recovery. */
export async function cleanupAgentBaseline(
  id: string,
  baseline: Profile,
  entries: { kind: string; id: string }[],
  operations: Operations,
) {
  let grants: GrantState[] = [];
  await operations.perform("agent-grants", id, async () => {
    grants = (await operations.read()).grants.filter((grant) =>
      ownsGrant(grant, baseline.grants, entries),
    );
  });
  for (const grant of grants)
    await operations.perform("grants", grant.id, async () => {
      const decision = grant.status === "pending" ? "deny" : "revoke";
      const terminal = decision === "deny" ? "denied" : "revoked";
      const result = await operations.decide(grant.id, decision);
      if (result.id !== grant.id || result.status !== terminal)
        operations.fail("grant.confirm-decision", "grant_not_terminal");
      const fresh = (await operations.read()).grants.find(
        (row) => row.id === grant.id,
      );
      if (!fresh || fresh.status !== terminal)
        operations.fail("grant.confirm-fresh-terminal", "grant_not_terminal");
    });
  await operations.perform("agent-settings", id, async () => {
    const { permissions, ...settings } = agentBaseline(baseline);
    for (const permission of permissions)
      await operations.permission(permission);
    await operations.settings(settings);
    const fresh = agentBaseline(await operations.read());
    if (
      Object.entries(settings).some(
        ([key, value]) => fresh[key as keyof typeof settings] !== value,
      ) ||
      fresh.permissions.length !== permissions.length ||
      permissions.some(
        (permission) =>
          !fresh.permissions.some(
            (row) =>
              row.capability === permission.capability &&
              row.decision === permission.decision,
          ),
      )
    )
      operations.fail("agent.confirm-baseline", "agent_baseline_not_restored");
  });
}
