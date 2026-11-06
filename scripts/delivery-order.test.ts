import { expect, it } from "vitest";
import { orderVisualOrganizations } from "../e2e/support/delivery-order";

it("keeps organization columns stable when fresh seed IDs change", () => {
  const organizations = [
    { id: "8000", name: "Atlas", archivedAt: null },
    { id: "ffff", name: "Taff Demo", archivedAt: null },
  ];
  const freshSeed = organizations.map((row) =>
    row.name === "Taff Demo" ? { ...row, id: "0000" } : row,
  );
  expect(orderVisualOrganizations(freshSeed).map((row) => row.name)).toEqual(
    orderVisualOrganizations(organizations).map((row) => row.name),
  );
});

it("retains real rows and breaks identical-name ties by ID", () => {
  const rows = [
    { id: "2", name: "Same", archivedAt: "2026-10-08" },
    { id: "1", name: "Same", archivedAt: null },
  ];
  const ordered = orderVisualOrganizations(rows);
  expect(ordered).toEqual([rows[1], rows[0]]);
  expect(ordered[0]).toBe(rows[1]);
  expect(rows[0].id).toBe("2");
});
