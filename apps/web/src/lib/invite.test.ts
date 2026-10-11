import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inviteBootScript,
  takeEmailVerificationToken,
  takeInviteToken,
} from "./invite";

type FakeWindow = {
  __taffInvite?: string;
  __taffVerifyEmail?: string;
  location: { hash: string; pathname: string; search: string };
  history: {
    replaceState: (data: unknown, title: string, url: string) => void;
  };
};

function fakeWindow(url: string): FakeWindow {
  const parsed = new URL(url, "http://taff.test");
  const win: FakeWindow = {
    location: {
      hash: parsed.hash,
      pathname: parsed.pathname,
      search: parsed.search,
    },
    history: {
      replaceState: vi.fn((_data, _title, next: string) => {
        const target = new URL(next, "http://taff.test");
        win.location.hash = target.hash;
        win.location.pathname = target.pathname;
        win.location.search = target.search;
      }),
    },
  };
  return win;
}

function boot(win: FakeWindow) {
  new Function("window", "location", "history", inviteBootScript)(
    win,
    win.location,
    win.history,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("invite fragment", () => {
  it.each([true, false])(
    "preserves both private tokens and consumes them once (boot=%s)",
    (early) => {
      const win = fakeWindow(
        "/?x=1#invite=invite-value&verifyEmail=verify-value",
      );
      if (early) boot(win);
      vi.stubGlobal("window", win);
      expect(takeInviteToken()).toBe("invite-value");
      expect(win.location.hash).toBe("");
      expect(takeEmailVerificationToken()).toBe("verify-value");
      expect(takeInviteToken()).toBeNull();
      expect(takeEmailVerificationToken()).toBeNull();
      expect(win.location.pathname + win.location.search).toBe("/?x=1");
    },
  );
  it("boot script keeps the token in memory and strips the fragment", () => {
    const win = fakeWindow("/?x=1#invite=abc%2Fdef");
    boot(win);
    expect(win.__taffInvite).toBe("abc/def");
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?x=1");
    expect(win.location.hash).toBe("");
    vi.stubGlobal("window", win);
    expect(takeInviteToken()).toBe("abc/def");
    expect(win.__taffInvite).toBeUndefined();
    expect(takeInviteToken()).toBeNull();
  });

  it("boot script leaves other fragments alone", () => {
    const win = fakeWindow("/orgs#team");
    boot(win);
    expect(win.__taffInvite).toBeUndefined();
    expect(win.history.replaceState).not.toHaveBeenCalled();
    expect(win.location.hash).toBe("#team");
    vi.stubGlobal("window", win);
    expect(takeInviteToken()).toBeNull();
  });

  it("reads a fragment set after start-up", () => {
    const win = fakeWindow("/#invite=late");
    vi.stubGlobal("window", win);
    expect(takeInviteToken()).toBe("late");
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(win.location.hash).toBe("");
  });
});
