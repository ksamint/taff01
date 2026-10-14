import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** True on the desktop layout (≥ 1024 px), the shell's breakpoint. */
export function useDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
