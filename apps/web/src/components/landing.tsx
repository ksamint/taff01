"use client";

import type { Locale } from "@taff/schemas";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Signed-out home (prototype v2 lines 48–77 and 1152–1183, ADR 0014 D3).
 * It absorbs sign-in; signed-in people never see it and deep links open
 * their target. The prototype's live stats are demo data, so the landing
 * describes the product instead.
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
  const features = [
    ["featureBoard", "featureBoardText"],
    ["featureReview", "featureReviewText"],
    ["featureMcp", "featureMcpText"],
  ] as const;
  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="landing-brand">
          <span className="landing-mark" aria-hidden="true">
            <Sparkles size={14} strokeWidth={1.5} />
          </span>
          <span>{t("app")}</span>
        </span>
        <span className="landing-actions">
          <label className="sr-only" htmlFor="locale-select">
            {t("language")}
          </label>
          <select
            id="locale-select"
            data-testid="locale-select"
            className="language-select"
            value={locale}
            disabled={localeDisabled}
            onChange={(event) => onLocale(event.target.value as Locale)}
          >
            <option value="en">{t("en")}</option>
            <option value="zh-CN">{t("zh-CN")}</option>
            <option value="zh-HK">{t("zh-HK")}</option>
          </select>
          <a className="button button-quiet landing-signin" href="#sign-in">
            {t("signIn")}
          </a>
        </span>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">{t("home.eyebrow")}</p>
          <h1>{t("home.title")}</h1>
          <p className="landing-sub">{t("home.subtitle")}</p>
          <a className="button button-cta landing-cta" href="#sign-in">
            {t("home.start")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </section>
        <section
          className="landing-features"
          aria-labelledby="landing-features-label"
        >
          <h2 className="landing-eyebrow" id="landing-features-label">
            {t("home.featuresLabel")}
          </h2>
          <ul>
            {features.map(([title, text]) => (
              <li key={title}>
                <h3>{t(`home.${title}`)}</h3>
                <p>{t(`home.${text}`)}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="landing-auth" id="sign-in" tabIndex={-1}>
          {children}
        </section>
      </main>
    </div>
  );
}
