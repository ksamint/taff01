import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import english from "../../locales/en/common.json";
import simplified from "../../locales/zh-CN/common.json";
import traditional from "../../locales/zh-HK/common.json";
import {
  browserTimeZone,
  LAST_WORKSPACE_KEY,
  preloadBootScript,
  readPreference,
  savePreference,
} from "./i18n";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps a chosen time zone without probing the browser", () => {
  const formatter = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
    throw new Error("unavailable");
  });
  expect(browserTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  expect(formatter).not.toHaveBeenCalled();
  expect(browserTimeZone("UTC")).toBe("UTC");
  expect(formatter).toHaveBeenCalledOnce();
});

it("detects the browser time zone for a new UTC account", () => {
  const expected = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = vi.spyOn(Intl, "DateTimeFormat");
  expect(browserTimeZone("UTC")).toBe(expected);
  expect(formatter).toHaveBeenCalledOnce();
});

it("supplies every translation key in each independently loaded locale", () => {
  const keys = (value: object, prefix = ""): string[] =>
    Object.entries(value)
      .flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof child === "object" && child !== null)
          return keys(child, path);
        expect(typeof child).toBe("string");
        expect(child).not.toBe("");
        return [path];
      })
      .sort();
  expect(keys(simplified)).toEqual(keys(english));
  expect(keys(traditional)).toEqual(keys(english));
});

it("preloads missing locale resources and workspace reads without duplicating server resources", () => {
  const workspace = "00000000-0000-4000-8000-000000000001";
  for (const loadedLocale of ["en", "zh-CN"] as const) {
    const links: { href: string; fetchPriority: string }[] = [];
    runInNewContext(preloadBootScript("test", loadedLocale), {
      localStorage: {
        getItem: (key: string) =>
          key === LAST_WORKSPACE_KEY ? workspace : "zh-CN",
      },
      document: {
        createElement: () => ({}),
        head: {
          appendChild: (link: { href: string; fetchPriority: string }) =>
            links.push(link),
        },
      },
    });
    // The locale file gates the first paint; workspace reads must not take
    // bandwidth from the scripts, so they are low priority.
    expect(links.map((link) => [link.href, link.fetchPriority])).toEqual([
      ...(loadedLocale === "en" ? [["/locales/zh-CN?v=test", "high"]] : []),
      [`/api/tasks?workspaceId=${workspace}`, "low"],
      [`/api/members?workspaceId=${workspace}`, "low"],
      [`/api/runs?workspaceId=${workspace}`, "low"],
    ]);
  }
});

it("persists a secure presentation cookie and the legacy browser preference", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("window", { location: { protocol: "https:" } });
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => values.set(key, value),
    getItem: (key: string) => values.get(key),
  });
  savePreference("zh-HK");
  expect(document.cookie).toBe(
    "taff-locale=zh-HK; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  expect(readPreference()).toBe("zh-HK");
  // @ts-expect-error JavaScript callers can provide an untrusted locale.
  savePreference("en; Domain=untrusted.example");
  expect(readPreference()).toBe("zh-HK");
  expect(document.cookie).not.toContain("Domain");
});

it("retains local preference when cookies are blocked", () => {
  const setItem = vi.fn();
  vi.stubGlobal(
    "document",
    Object.defineProperty({}, "cookie", {
      set: () => {
        throw new Error("cookies_disabled");
      },
    }),
  );
  vi.stubGlobal("window", { location: { protocol: "http:" } });
  vi.stubGlobal("localStorage", { setItem });
  expect(() => savePreference("zh-CN")).not.toThrow();
  expect(setItem).toHaveBeenCalledWith("taff-locale", "zh-CN");
});
