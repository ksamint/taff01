/** Stop new work before closing dependencies; stay within Compose's 30s grace. */
export function createShutdown(
  stop: (() => Promise<unknown>)[],
  close: (() => Promise<unknown>)[],
  onError: (stage: "stop" | "cleanup" | "timeout") => void,
) {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= (async () => {
      const deadline = setTimeout(() => {
        onError("timeout");
        process.exit(1);
      }, 25_000);
      deadline.unref();
      let failed = false;
      const drained = await Promise.allSettled(
        stop.map((drain) => Promise.resolve().then(drain)),
      );
      if (drained.some((result) => result.status === "rejected")) {
        failed = true;
        onError("stop");
      }
      const results = await Promise.allSettled(
        close.map((cleanup) => Promise.resolve().then(cleanup)),
      );
      if (results.some((result) => result.status === "rejected")) {
        failed = true;
        onError("cleanup");
      }
      clearTimeout(deadline);
      process.exit(failed ? 1 : 0);
    })();
    return pending;
  };
}
