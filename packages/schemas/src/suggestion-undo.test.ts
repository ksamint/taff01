import { describe, expect, it } from "vitest";
import { suggestionDecisionSchema, suggestionInverseSchema } from "./assistant";

const id = "00000000-0000-4000-8000-000000000001";
const task = { id, version: 1, updatedAt: "2026-10-15T00:00:00.000Z" };
describe("versioned suggestion undo", () => {
  it("requires a positive version", () => {
    for (const input of [{}, { version: 0 }, { version: -1 }, { version: 1.5 }])
      expect(suggestionDecisionSchema.safeParse(input).success).toBe(false);
    expect(suggestionDecisionSchema.parse({ version: 2 })).toEqual({
      version: 2,
    });
  });
  it("retains exact prior state and guards in the persisted inverse", () => {
    const inverse = {
      kind: "reschedule",
      task,
      dueAt: null,
      planVersion: 2,
      plan: { startDate: "2026-10-10", durationDays: 3, archivedAt: null },
    };
    expect(suggestionInverseSchema.parse(inverse)).toEqual(inverse);
    expect(
      suggestionInverseSchema.safeParse({ ...inverse, planVersion: 0 }).success,
    ).toBe(false);
    expect(
      suggestionInverseSchema.safeParse({ kind: "split", tasks: [] }).success,
    ).toBe(false);
    expect(
      suggestionInverseSchema.parse({ kind: "split", tasks: [task] }),
    ).toEqual({ kind: "split", tasks: [task] });
  });
});
