import {
  type AgentProfile,
  capabilitySchema,
  grantSchema,
  type Member,
  permissionDecisionSchema,
  reviewPolicySchema,
} from "@taff/schemas";
import type { TFunction } from "i18next";

type HistoryEntry = AgentProfile["history"][number];

export function historyMessage(entry: HistoryEntry, t: TFunction): string {
  const capability = capabilitySchema.safeParse(entry.details.capability);
  const status = grantSchema.shape.status.safeParse(entry.details.status);
  const decision = permissionDecisionSchema.safeParse(entry.details.decision);
  const policy = reviewPolicySchema.safeParse(entry.details.reviewPolicy);
  if (capability.success && status.success) {
    const previous = grantSchema.shape.status.safeParse(
      entry.details.previousStatus,
    );
    return t(
      previous.success
        ? "agentProfile.historyGrantChanged"
        : "agentProfile.historyGrant",
      {
        capability: t(`agentProfile.capability.${capability.data}`),
        status: t(`grants.status.${status.data}`),
        previousStatus: previous.success
          ? t(`grants.status.${previous.data}`)
          : "",
      },
    );
  }
  if (capability.success && decision.success)
    return t("agentProfile.historyPermission", {
      capability: t(`agentProfile.capability.${capability.data}`),
      decision: t(`agentProfile.decision.${decision.data}`),
    });
  if (policy.success)
    return t("agentProfile.historyPolicy", {
      policy: t(
        policy.data === "always_review"
          ? "agentProfile.alwaysReview"
          : "agentProfile.askOnly",
      ),
    });
  return t("agentProfile.historySettings");
}

export function historyActor(
  entry: HistoryEntry,
  members: Member[],
  fallback: string,
): string {
  const id = entry.actorId.replace(/^agent:/, "");
  return (
    members.find((member) => member.id === id || member.userId === id)?.name ??
    fallback
  );
}
