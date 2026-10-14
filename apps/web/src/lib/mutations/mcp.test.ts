import type { AgentToken } from "@taff/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PartialRegenerateError,
  regenerateAgentToken,
  withRegeneratedToken,
  withRestoredToken,
} from "./mcp";

const NOW = "2026-10-14T09:00:00.000Z";
const ws = "00000000-0000-4000-8000-000000000001";
const old: AgentToken = {
  id: "00000000-0000-4000-8000-000000000002",
  workspaceId: ws,
  memberId: "00000000-0000-4000-8000-000000000003",
  createdBy: "00000000-0000-4000-8000-000000000004",
  name: "Claude Desktop",
  prefix: "taff_abcdefg",
  scopes: ["tasks:read", "calendar:write"],
  createdAt: NOW,
  revokedAt: null,
  lastUsedAt: null,
};
const issued = {
  ...old,
  id: "00000000-0000-4000-8000-000000000005",
  prefix: "taff_hijklmn",
  token: "taff_hijklmnopqrstuvwxyz",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("mcp token cache helpers", () => {
  it("restores only the undone token", () => {
    const other = { ...old, id: "other", revokedAt: NOW };
    const next = withRestoredToken([{ ...old, revokedAt: NOW }, other], old.id);
    expect(next[0].revokedAt).toBeNull();
    expect(next[1]).toBe(other);
    expect(withRestoredToken(undefined, old.id)).toEqual([]);
  });
  it("puts the regenerated token first and revokes the replaced one", () => {
    const next = withRegeneratedToken([old], old, { ...issued }, NOW);
    expect(next.map((token) => [token.id, token.revokedAt])).toEqual([
      [issued.id, null],
      [old.id, NOW],
    ]);
  });
});

describe("regenerateAgentToken", () => {
  it("issues the replacement with the same name, agent and scopes, then revokes", async () => {
    const calls: [string, string, unknown][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init: RequestInit) => {
        calls.push([
          init.method ?? "GET",
          path,
          init.body ? JSON.parse(String(init.body)) : null,
        ]);
        return init.method === "POST"
          ? json(issued, 201)
          : json({ ...old, revokedAt: NOW });
      }),
    );
    await expect(regenerateAgentToken(old)).resolves.toEqual(issued);
    expect(calls).toEqual([
      [
        "POST",
        "/api/agent-tokens",
        {
          workspaceId: ws,
          memberId: old.memberId,
          name: old.name,
          scopes: old.scopes,
        },
      ],
      ["DELETE", `/api/agent-tokens/${old.id}`, null],
    ]);
  });
  it("never revokes when issuing fails", async () => {
    const fetch = vi.fn(async () => json({ error: "forbidden" }, 403));
    vi.stubGlobal("fetch", fetch);
    await expect(regenerateAgentToken(old)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the issued secret when the old token cannot be revoked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: string, init: RequestInit) =>
        init.method === "POST"
          ? json(issued, 201)
          : json({ error: "conflict" }, 409),
      ),
    );
    const error = await regenerateAgentToken(old).catch((cause) => cause);
    expect(error).toBeInstanceOf(PartialRegenerateError);
    expect(error).toMatchObject({ code: "conflict", status: 409, issued });
  });
});
