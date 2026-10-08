"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { type ReactNode, useEffect, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "../../locales/en/common.json";
import zh from "../../locales/zh-CN/common.json";

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
      resources: { en: { translation: en }, "zh-CN": { translation: zh } },
      lng: "en",
      fallbackLng: "en",
      initImmediate: false,
      interpolation: { escapeValue: false },
    });
    return instance;
  });
  useEffect(() => {
    let preference: string | null = null;
    try {
      preference = localStorage.getItem("taff-locale");
    } catch {
      /* Storage may be disabled. */
    }
    void i18n.changeLanguage(
      preference === "zh-CN" ||
        (!preference && navigator.language.startsWith("zh"))
        ? "zh-CN"
        : "en",
    );
    const updateLang = (language: string) => {
      document.documentElement.lang = language;
    };
    i18n.on("languageChanged", updateLang);
    updateLang(i18n.language);
    return () => {
      i18n.off("languageChanged", updateLang);
    };
  }, [i18n]);
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
