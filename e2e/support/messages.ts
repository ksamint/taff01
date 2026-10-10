import en from "../../apps/web/locales/en/common.json";
import zhCN from "../../apps/web/locales/zh-CN/common.json";
import zhHK from "../../apps/web/locales/zh-HK/common.json";

export const messages = { en, "zh-CN": zhCN, "zh-HK": zhHK };
export type TestLocale = keyof typeof messages;
