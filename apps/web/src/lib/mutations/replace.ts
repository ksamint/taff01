/** Swaps the optimistic row `id` for the server's row. */
export function replaceById<T extends { id: string }>(
  current: T[] | undefined,
  id: string,
  value: T,
) {
  return current?.map((item) => (item.id === id ? value : item));
}
