export function orderVisualOrganizations<
  T extends { id: string; name: string },
>(organizations: readonly T[]): T[] {
  return [...organizations].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "en") ||
      left.id.localeCompare(right.id, "en"),
  );
}
