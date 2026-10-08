"use client";

import type { Locale } from "@taff/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { type ReactNode, useEffect, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "../../locales/en/common.json";
import { detectLocale, htmlLang, isLocale, readPreference } from "../lib/i18n";

// Only English ships in the initial bundle; Chinese bundles load on demand.
const loaders: Record<Exclude<Locale, "en">, () => Promise<object>> = {
  "zh-CN": () => import("../../locales/zh-CN/common.json"),
  "zh-HK": () => import("../../locales/zh-HK/common.json"),
};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  const [i18n] = useState(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      resources: { en: { translation: en } },
      lng: "en",
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN", "zh-HK"],
      initAsync: false,
      interpolation: { escapeValue: false },
    });
    return instance;
  });
  useEffect(() => {
    const original = i18n.changeLanguage.bind(i18n);
    i18n.changeLanguage = async (language, callback) => {
      if (
        isLocale(language) &&
        language !== "en" &&
        !i18n.hasResourceBundle(language, "translation")
      ) {
        const bundle = (await loaders[language]()) as {
          default?: object;
        };
        i18n.addResourceBundle(
          language,
          "translation",
          bundle.default ?? bundle,
        );
      }
      return original(language, callback);
    };
    void i18n.changeLanguage(
      readPreference() ?? detectLocale(navigator.languages),
    );
    const updateLang = (language: string) => {
      document.documentElement.lang = htmlLang(language);
    };
    i18n.on("languageChanged", updateLang);
    updateLang(i18n.language);
    return () => {
      i18n.off("languageChanged", updateLang);
      i18n.changeLanguage = original;
    };
  }, [i18n]);
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
