import { describe, expect, it } from "vitest";
import { recordOwnWrite, sendVersion } from "./mind";

describe("mind write versions", () => {
  it("sends the version the person acted on when this tab has not moved it", () => {
    expect(sendVersion("node-fresh", 4)).toBe(4);
  });
  it("follows this tab's own later writes, such as an undo before an archive", () => {
    // Edit (1 → 2), then Undo (2 → 3); Archive was clicked on version 2.
    recordOwnWrite("node-a", 1, 2);
    recordOwnWrite("node-a", 2, 3);
    expect(sendVersion("node-a", 2)).toBe(3);
    expect(sendVersion("node-a", 1)).toBe(3);
  });
  it("never skips a version written elsewhere, so a real conflict still fails", () => {
    recordOwnWrite("node-b", 1, 2);
    // Someone else moved it 2 → 3; this tab acted on 2 and knows nothing more.
    expect(sendVersion("node-b", 2)).toBe(2);
    // Writes to other rows do not count.
    recordOwnWrite("node-c", 2, 3);
    expect(sendVersion("node-b", 2)).toBe(2);
  });
});
