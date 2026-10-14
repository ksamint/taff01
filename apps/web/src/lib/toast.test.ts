import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissToast,
  holdToast,
  readToast,
  showToast,
  subscribeToast,
} from "./toast";

afterEach(() => {
  dismissToast();
  vi.useRealTimers();
});
describe("toast store", () => {
  it("replaces the current toast and expires it", () => {
    vi.useFakeTimers();
    const seen: (string | undefined)[] = [];
    const stop = subscribeToast(() => seen.push(readToast()?.text));
    showToast("one");
    showToast("two");
    expect(readToast()?.text).toBe("two");
    vi.advanceTimersByTime(3600);
    expect(readToast()).toBeNull();
    expect(seen).toEqual(["one", "two", undefined]);
    stop();
  });
  it("keeps the toast while held and ignores stale dismissals", () => {
    vi.useFakeTimers();
    const first = showToast("saved", { label: "Undo", run: () => {} });
    holdToast(true);
    vi.advanceTimersByTime(10000);
    expect(readToast()?.action?.label).toBe("Undo");
    showToast("next");
    dismissToast(first);
    expect(readToast()?.text).toBe("next");
    holdToast(false);
    vi.advanceTimersByTime(3600);
    expect(readToast()).toBeNull();
  });
});
