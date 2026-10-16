// Keep native Temporal when available. Older browsers share one deferred
// polyfill load before any calendar/editor module evaluates.
let fallback: Promise<unknown> | undefined;
export async function withTemporal<T>(load: () => Promise<T>): Promise<T> {
  if (typeof globalThis.Temporal === "undefined")
    await (fallback ??= import("temporal-polyfill/global"));
  return load();
}
