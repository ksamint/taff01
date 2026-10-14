import type { Page } from "@playwright/test";

export type HeldRequest = {
  /** Resolves when the held request reaches the route. */
  seen: Promise<void>;
  /** Lets the held request go on: rejected with 403, or sent to the server. */
  release: () => void;
  /** Resolves once the held request has been answered or passed on. */
  done: Promise<void>;
};

/**
 * Holds the next `method` request matching `**${path}` until `release()`, then
 * either answers it 403 (`reply: "reject"`) or passes it on (`"continue"`).
 *
 * The route is never unrouted. It stays registered and hands every other
 * request, and every request after the held one, to `route.fallback()`. A later
 * hold on the same path is registered after this one, so it runs first.
 *
 * Unrouting while the app is live is unsafe. When the last route on a page goes,
 * Playwright switches Chromium request interception off at once. A request
 * Chromium has already paused under the old patterns is then never continued
 * and never completes. That is typically one of the refetches a settled write
 * starts. TanStack Query awaits those reads in onSettled, so the mutation stays
 * pending: no rollback alert appears and the write controls stay disabled.
 */
export async function holdRequest(
  page: Page,
  path: string,
  { method, reply }: { method: string; reply: "reject" | "continue" },
): Promise<HeldRequest> {
  let used = false;
  let release!: () => void;
  let arrived!: () => void;
  let completed!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const done = new Promise<void>((resolve) => {
    completed = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (used || route.request().method() !== method) {
      await route.fallback();
      return;
    }
    used = true;
    arrived();
    await gate;
    if (reply === "reject")
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "forbidden" }),
      });
    else await route.fallback();
    completed();
  });
  return { seen, release, done };
}
