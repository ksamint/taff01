import type { Locale } from "@taff/schemas";
import { createInstance } from "i18next";
import english from "../../locales/en/common.json";
import simplified from "../../locales/zh-CN/common.json";
import traditional from "../../locales/zh-HK/common.json";
import type { Translate } from "../components/summary-document";

const MESSAGES = { en: english, "zh-CN": simplified, "zh-HK": traditional };

/**
 * A fixed translator for server-rendered public pages (the share link,
 * ADR 0027), which render in the recipient's stored language rather than
 * the viewer's. Same options as the client instance in providers.tsx.
 */
export function serverTranslator(locale: Locale): Translate {
  const instance = createInstance();
  void instance.init({
    resources: { [locale]: { translation: MESSAGES[locale] } },
    lng: locale,
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return (key, options) => String(instance.t(key, options));
}
