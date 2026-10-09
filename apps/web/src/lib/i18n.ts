import type { Locale } from "@taff/schemas";

export const locales: Locale[] = ["en", "zh-CN", "zh-HK"];

/** BCP 47 tag for the document, so CJK letter-spacing rules apply. */
export function htmlLang(locale: string): string {
  if (locale === "zh-HK") return "zh-Hant-HK";
  if (locale === "zh-CN") return "zh-Hans-CN";
  return "en";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

/** Picks a locale from a browser language list. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase();
    if (!tag.startsWith("zh")) {
      if (tag.startsWith("en")) return "en";
      continue;
    }
    if (
      tag.includes("hant") ||
      tag.includes("-hk") ||
      tag.includes("-tw") ||
      tag.includes("-mo")
    )
      return "zh-HK";
    return "zh-CN";
  }
  return "en";
}

/** The browser's IANA zone, or UTC when the platform cannot say. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function savePreference(locale: Locale) {
  if (!isLocale(locale)) return;
  try {
    document.cookie = `taff-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* Cookies may be disabled; the browser preference still works. */
  }
  try {
    localStorage.setItem("taff-locale", locale);
  } catch {
    /* Storage may be disabled. */
  }
}

export const LAST_WORKSPACE_KEY = "taff:last-workspace";

/**
 * Inline head script for returning browsers: the locale file and the last
 * workspace's first reads start with the HTML instead of after the JavaScript
 * has downloaded and run. The API authorizes every request, so a stale or
 * foreign id only wastes one small response.
 */
export function preloadBootScript(
  version: string,
  loadedLocale: Locale = "en",
) {
  // Server-supplied resources need no competing JSON download.
  return `try{var p=function(h){var k=document.createElement("link");k.rel="preload";k.as="fetch";k.crossOrigin="anonymous";k.href=h;document.head.appendChild(k)};var l=localStorage.getItem("taff-locale");if((l==="zh-CN"||l==="zh-HK")&&l!==${JSON.stringify(loadedLocale)})p("/locales/"+l+"?v=${version}");var w=localStorage.getItem("${LAST_WORKSPACE_KEY}");if(w&&/^[0-9a-f-]{36}$/.test(w)){p("/api/tasks?workspaceId="+w);p("/api/members?workspaceId="+w)}}catch(e){}`;
}

export function readPreference(): Locale | null {
  try {
    const value = localStorage.getItem("taff-locale");
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}
