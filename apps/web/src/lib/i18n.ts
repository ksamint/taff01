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
  try {
    localStorage.setItem("taff-locale", locale);
  } catch {
    /* Storage may be disabled. */
  }
}

export function readPreference(): Locale | null {
  try {
    const value = localStorage.getItem("taff-locale");
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}
