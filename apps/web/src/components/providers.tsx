"use client";

import type { Locale } from "@taff/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "../../locales/en/common.json";
import { detectLocale, htmlLang, readPreference } from "../lib/i18n";
import { installLocaleLoader } from "../lib/locale-loader";

// Only English ships as JavaScript; Chinese resources are cached JSON on demand.
const loaders: Record<Exclude<Locale, "en">, () => Promise<object>> = {
  "zh-CN": () =>
    fetch("/locales/zh-CN").then((response) => {
      if (!response.ok) throw new Error("locale_load_failed");
      return response.json();
    }),
  "zh-HK": () =>
    fetch("/locales/zh-HK").then((response) => {
      if (!response.ok) throw new Error("locale_load_failed");
      return response.json();
    }),
};

const WorkspaceSelection = createContext<{
  id: string;
  setId: (id: string) => void;
  invitation: string | null;
  setInvitation: (token: string | null) => void;
} | null>(null);
export function useWorkspaceSelection() {
  const value = useContext(WorkspaceSelection);
  if (!value) throw new Error("WorkspaceSelection needs Providers");
  return value;
}

export function Providers({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [invitation, setInvitation] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "invite",
    );
    if (token) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      setInvitation(token);
    }
  }, []);
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
    const restore = installLocaleLoader(i18n, (language) =>
      loaders[language](),
    );
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
      restore();
    };
  }, [i18n]);
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <WorkspaceSelection.Provider
          value={{
            id: workspaceId,
            setId: setWorkspaceId,
            invitation,
            setInvitation,
          }}
        >
          {children}
        </WorkspaceSelection.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
