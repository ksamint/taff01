/** The worker caches public assets only; installing it never persists a session. */
export function registerPublicWorker() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* Browsers without worker access retain the normal online application. */
      });
  }
}
