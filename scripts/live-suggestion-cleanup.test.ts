import { describe, expect, it, vi } from "vitest";
import { cleanupSuggestion } from "../e2e/live/suggestion-cleanup";

const entry = {
  id: "proposal",
  workspaceId: "verification",
  taskId: "owned-task",
};
const proposal = { ...entry, version: 3, status: "pending" };
function api() {
  return {
    list: vi.fn().mockResolvedValue([proposal]),
    dismiss: vi
      .fn()
      .mockResolvedValue({ ...proposal, version: 4, status: "dismissed" }),
    fail: (): never => {
      throw new Error("unverified ownership");
    },
  };
}
describe("live human proposal cleanup ownership", () => {
  it("dismisses the exact current version of a journaled pending proposal", async () => {
    const calls = api();
    await cleanupSuggestion(
      entry,
      "verification",
      new Set([entry.taskId]),
      calls,
    );
    expect(calls.list).toHaveBeenCalledWith(entry.taskId);
    expect(calls.dismiss).toHaveBeenCalledWith(entry.id, 3);
  });
  it.each(["applied", "dismissed"])(
    "retains %s proposal history without mutation",
    async (status) => {
      const calls = api();
      calls.list.mockResolvedValue([{ ...proposal, status }]);
      await cleanupSuggestion(
        entry,
        "verification",
        new Set([entry.taskId]),
        calls,
      );
      expect(calls.dismiss).not.toHaveBeenCalled();
    },
  );
  it.each([
    [{ ...entry, workspaceId: "other" }, new Set([entry.taskId])],
    [entry, new Set<string>()],
    [{ ...entry, taskId: undefined }, new Set([entry.taskId])],
  ])(
    "refuses unowned journal entries before any HTTP operation",
    async (invalid, tasks) => {
      const calls = api();
      await expect(
        cleanupSuggestion(invalid, "verification", tasks, calls),
      ).rejects.toThrow("unverified ownership");
      expect(calls.list).not.toHaveBeenCalled();
      expect(calls.dismiss).not.toHaveBeenCalled();
    },
  );
  it.each([
    [[]],
    [[{ ...proposal, workspaceId: "other" }]],
    [[{ ...proposal, taskId: "other" }]],
  ])("refuses a missing or mismatched server row", async (rows) => {
    const calls = api();
    calls.list.mockResolvedValue(rows);
    await expect(
      cleanupSuggestion(entry, "verification", new Set([entry.taskId]), calls),
    ).rejects.toThrow("unverified ownership");
    expect(calls.dismiss).not.toHaveBeenCalled();
  });
  it("fails cleanup when the server does not confirm dismissal", async () => {
    const calls = api();
    calls.dismiss.mockResolvedValue(proposal);
    await expect(
      cleanupSuggestion(entry, "verification", new Set([entry.taskId]), calls),
    ).rejects.toThrow("unverified ownership");
  });
});
