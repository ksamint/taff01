import type { Page, Route } from "@playwright/test";
import { expect, it, vi } from "vitest";
import { navigateColdFonts } from "./cold-font-layout";

it.each([false, true])(
  "drains the owned route before removing interception when readiness fails=%s",
  async (fail) => {
    let beginContinue!: () => void;
    const continuing = new Promise<void>((resolve) => {
      beginContinue = resolve;
    });
    let finishContinue!: () => void;
    const continued = new Promise<void>((resolve) => {
      finishContinue = resolve;
    });
    let handler!: (route: Route) => Promise<void>;
    let pendingRoute!: Promise<void>;
    const route = {
      continue: () => {
        beginContinue();
        return continued;
      },
    } as unknown as Route;
    const response = { status: () => 200 };
    const remove = vi.fn(async (pattern, owned) => {
      expect(pattern).toBe("**/fonts/*.woff2");
      expect(owned).toBe(handler);
    });
    const page = {
      route: async (_pattern: string, owned: typeof handler) => {
        handler = owned;
      },
      goto: async () => {
        pendingRoute = handler(route);
        return response;
      },
      evaluate: async () => {},
      unroute: remove,
    } as unknown as Page;
    const navigation = navigateColdFonts(
      page,
      "https://capture.test",
      async () => {
        if (fail) throw new Error("readiness failed");
      },
    );
    // Observe rejection immediately while retaining a pending continuation.
    const settled = navigation.then(
      (value) => ({ value, error: undefined }),
      (error: Error) => ({ value: undefined, error }),
    );
    try {
      await continuing;
      expect(remove).not.toHaveBeenCalled();
    } finally {
      finishContinue();
      await pendingRoute;
      const result = await settled;
      expect(remove).toHaveBeenCalledTimes(1);
      if (fail) expect(result.error?.message).toBe("readiness failed");
      else expect(result.value).toBe(response);
    }
  },
);
