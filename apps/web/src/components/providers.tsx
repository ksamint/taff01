"use client";

import type { Locale, Me } from "@taff/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance, type ResourceLanguage } from "i18next";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { detectLocale, htmlLang, readPreference } from "../lib/i18n";
import { takeInviteToken } from "../lib/invite";
import { installLocaleLoader } from "../lib/locale-loader";
import { bootstrapSession } from "../lib/session-cache";

// Only the stored locale arrives as server data; others load on demand.
const localeUrl = (locale: string) =>
  `/locales/${locale}?v=${process.env.NEXT_PUBLIC_ASSET_VERSION ?? "dev"}`;

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

export function Providers({
  children,
  initialLocale,
  messages,
  initialMe,
}: {
  children: ReactNode;
  initialLocale: Locale | null;
  messages: ResourceLanguage;
  initialMe: Me | null | undefined;
}) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [invitation, setInvitation] = useState<string | null>(null);
  useEffect(() => {
    const token = takeInviteToken();
    if (token) setInvitation(token);
  }, []);
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
    });
    if (initialMe !== undefined) {
      queryClient.setQueryData(["me"], initialMe, { updatedAt: 0 });
      bootstrapSession(queryClient, initialMe);
    }
    return queryClient;
  });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("../lib/cache-persistence")
      .then(({ installCachePersistence }) => {
        if (!disposed) cleanup = installCachePersistence(client);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [client]);
  const [{ i18n, initialChoice, cancelLocaleLoad }] = useState(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      resources: {
        [initialLocale ?? "en"]: { translation: messages },
      },
      lng: initialLocale ?? "en",
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN", "zh-HK"],
      initAsync: false,
      interpolation: { escapeValue: false },
    });
    // react-i18next snapshots methods during render, before passive effects.
    const cancelLocaleLoad = installLocaleLoader(instance, async (language) => {
      const response = await fetch(localeUrl(language));
      if (!response.ok) throw new Error("locale_load_failed");
      return response.json();
    });
    return { i18n: instance, initialChoice: initialLocale, cancelLocaleLoad };
  });
  useEffect(() => {
    if (!initialChoice) {
      const language = readPreference() ?? detectLocale(navigator.languages);
      if (i18n.language !== language) void i18n.changeLanguage(language);
    }
    const updateLang = (language: string) => {
      document.documentElement.lang = htmlLang(language);
    };
    i18n.on("languageChanged", updateLang);
    updateLang(i18n.language);
    return () => {
      i18n.off("languageChanged", updateLang);
      cancelLocaleLoad();
    };
  }, [i18n, initialChoice, cancelLocaleLoad]);
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
