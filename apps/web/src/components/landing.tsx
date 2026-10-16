"use client";

import type { Locale } from "@taff/schemas";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const headlines = ["home.headline1", "home.headline2", "home.headline3"];
const ROTATE_MS = 4000;

/**
 * Signed-out home (ADR 0014 D3), reduced to the wordmark, the language,
 * one rotating line and the sign-in form. Signed-in people never see it and
 * deep links open their target.
 */
export function Landing({
  children,
  locale,
  onLocale,
  localeDisabled,
}: {
  children: ReactNode;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  localeDisabled: boolean;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (motion?.matches) {
        setIndex(0);
        return;
      }
      timer = setInterval(
        () => setIndex((current) => (current + 1) % headlines.length),
        ROTATE_MS,
      );
    };
    sync();
    motion?.addEventListener("change", sync);
    return () => {
      clearInterval(timer);
      motion?.removeEventListener("change", sync);
    };
  }, []);
  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="landing-brand">{t("app")}</span>
        <label className="sr-only" htmlFor="locale-select">
          {t("language")}
        </label>
        <select
          id="locale-select"
          data-testid="locale-select"
          className="language-select landing-language"
          value={locale}
          disabled={localeDisabled}
          onChange={(event) => onLocale(event.target.value as Locale)}
        >
          <option value="zh-HK">{t("zh-HK")}</option>
          <option value="zh-CN">{t("zh-CN")}</option>
          <option value="en">{t("en")}</option>
        </select>
      </header>
      <main className="landing-main">
        <h1 className="landing-title" key={index}>
          {t(headlines[index] ?? "home.headline1")}
        </h1>
        <section className="landing-auth" id="sign-in" tabIndex={-1}>
          {children}
        </section>
      </main>
    </div>
  );
}
