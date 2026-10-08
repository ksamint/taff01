import type { AgentProfile, Member } from "@taff/schemas";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../../locales/en/common.json";
import { historyActor, historyMessage } from "./agent-history";

const i18n = createInstance();
void i18n.init({
  resources: { en: { translation: en } },
  lng: "en",
  initAsync: false,
});
const entry = {
  id: "row",
  actorId: "auth-user",
  action: "agent_permissions.update",
  resourceId: "agent-id",
  details: {},
  createdAt: "2026-10-09T00:00:00Z",
} satisfies AgentProfile["history"][number];

describe("agent configuration history", () => {
  it("describes permissions and grants with localized names instead of database operations", () => {
    expect(
      historyMessage(
        { ...entry, details: { capability: "web.search", decision: "ask" } },
        i18n.t,
      ),
    ).toBe("Search the web: Ask");
    expect(
      historyMessage(
        {
          ...entry,
          details: {
            capability: "repo.read",
            status: "allowed",
            previousStatus: "pending",
          },
        },
        i18n.t,
      ),
    ).toBe("Read repositories: Pending → Allowed");
    expect(
      historyMessage(
        { ...entry, details: { reviewPolicy: "always_review" } },
        i18n.t,
      ),
    ).toBe("Review policy: Always review");
    expect(
      historyMessage(
        { ...entry, details: { capability: "unknown", decision: "secret" } },
        i18n.t,
      ),
    ).toBe("Agent settings changed");
  });
  it("resolves person authentication IDs and agent member IDs, with a readable fallback", () => {
    const person = {
      id: "member",
      workspaceId: "workspace",
      userId: "auth-user",
      name: "Lin Xiao",
      kind: "person",
      role: "admin",
    } satisfies Member;
    const agent = {
      ...person,
      id: "agent-id",
      userId: null,
      name: "Code Agent",
      kind: "agent",
    } satisfies Member;
    expect(historyActor(entry, [person, agent], "Team member")).toBe(
      "Lin Xiao",
    );
    expect(
      historyActor(
        { ...entry, actorId: "agent:agent-id" },
        [person, agent],
        "Team member",
      ),
    ).toBe("Code Agent");
    expect(
      historyActor(
        { ...entry, actorId: "unknown-uuid" },
        [person, agent],
        "Team member",
      ),
    ).toBe("Team member");
  });
});
