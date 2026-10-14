import { useSyncExternalStore } from "react";

/** The desktop layout starts at 1024 px, the same breakpoint as the shell. */
const QUERY = "(min-width: 1024px)";

function subscribe(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/**
 * True on the desktop layout. The server and the first client render use the
 * phone layout, so hydration matches before the media query takes over.
 */
export function useDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
