import { createInstance } from "i18next";
import en from "../../../apps/web/locales/en/common.json";
import zhCN from "../../../apps/web/locales/zh-CN/common.json";
import zhHK from "../../../apps/web/locales/zh-HK/common.json";
import type { SummaryTranslate } from "./summary-text";

const messages = createInstance();
void messages.init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
    "zh-HK": { translation: zhHK },
  },
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});
export function summaryTranslate(
  locale: "en" | "zh-CN" | "zh-HK",
): SummaryTranslate {
  return (key, values) => messages.t(key, { ...values, lng: locale });
}
