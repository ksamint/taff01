import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("preserves the released default-agent migration and appends approval/project migrations after it", async () => {
  const base = new URL("../migrations/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", base), "utf8"),
  );
  expect(journal.entries[33]).toMatchObject({
    idx: 33,
    tag: "0033_personal_default_agent",
    when: 1792483200001,
  });
  expect(
    createHash("sha256")
      .update(await readFile(new URL("0033_personal_default_agent.sql", base)))
      .digest("hex"),
  ).toBe("93fcf77bf4ef70e4ea99b95c7be4f00029d71acd947d0f2d4119a452a4236f8d");
  const pending = journal.entries.slice(34);
  expect(pending.map((entry: { tag: string }) => entry.tag)).toEqual([
    "0034_trusted_review_receipts",
    "0035_approved_agent_receipts",
    "0036_integration_audit",
    "0037_project_delivery",
    "0038_agent_token_workspaces",
    "0039_oauth_refresh_history",
  ]);
  for (const entry of pending) {
    expect(entry.when).toBeGreaterThan(journal.entries[33].when);
    expect(Number(entry.tag.slice(0, 4))).toBe(entry.idx);
    expect(
      (await readFile(new URL(entry.tag + ".sql", base), "utf8")).length,
    ).toBeGreaterThan(0);
  }
});
