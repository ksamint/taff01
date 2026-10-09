"use client";

import type { Locale } from "@taff/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMembers } from "../lib/queries";
import { applyTheme, readTheme, type ThemePreference } from "../lib/theme";
import { useWorkspace } from "./app-shell";
import { Label } from "./ui/label";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

export function MeView() {
  const { me, workspace, setWorkspaceId, setLocale, localePending } =
    useWorkspace();
  const { t, i18n } = useTranslation();
  const members = useMembers(workspace.id);
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => setTheme(readTheme()), []);
  return (
    <>
      <section className="page-heading">
        <h1>{t("me.title")}</h1>
        <p className="task-count">
          {t("me.signedInAs", { name: me.user.name })}
        </p>
      </section>
      <section className="me-section" aria-labelledby="account-heading">
        <h2 id="account-heading">{t("me.account")}</h2>
        <dl className="me-row">
          <dt>{t("name")}</dt>
          <dd>{me.user.name}</dd>
        </dl>
        <dl className="me-row">
          <dt>{t("email")}</dt>
          <dd>{me.user.email}</dd>
        </dl>
        <div className="field">
          <Label htmlFor="workspace">{t("workspace")}</Label>
          <select
            id="workspace"
            value={workspace.id}
            disabled={me.workspaces.length < 2}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {me.workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="me-section">
        <Link className="button" href="/orgs">
          {t("organization.title")}
        </Link>
      </section>
      <section className="me-section" aria-labelledby="agents-list-heading">
        <h2 id="agents-list-heading">{t("agentProfile.team")}</h2>
        <ul className="history-list">
          {members.data
            ?.filter((member) => member.kind === "agent")
            .map((member) => (
              <li key={member.id}>
                <Link className="text-link" href={`/agents/${member.id}`}>
                  {member.name}
                </Link>
              </li>
            ))}
        </ul>
      </section>
      <section className="me-section" aria-labelledby="integrations-heading">
        <h2 id="integrations-heading">{t("mcp.title")}</h2>
        <p className="section-hint">{t("mcp.subtitle")}</p>
        <Link className="button" href="/me/mcp" data-testid="open-mcp">
          {t("mcp.open")}
        </Link>
      </section>
      <section className="me-section" aria-labelledby="preferences-heading">
        <h2 id="preferences-heading">{t("me.preferences")}</h2>
        <div className="field">
          <Label htmlFor="me-locale">{t("language")}</Label>
          <select
            id="me-locale"
            value={i18n.resolvedLanguage ?? me.user.locale}
            disabled={localePending}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="en">{t("en")}</option>
            <option value="zh-CN">{t("zh-CN")}</option>
            <option value="zh-HK">{t("zh-HK")}</option>
          </select>
        </div>
        <fieldset
          className="field"
          style={{ border: 0, padding: 0, margin: "16px 0 0" }}
        >
          <legend className="label">{t("me.appearance")}</legend>
          <div className="radio-row">
            {THEMES.map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="theme"
                  value={item}
                  checked={theme === item}
                  onChange={() => {
                    setTheme(item);
                    applyTheme(item);
                  }}
                />
                {t(`me.${item}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="me-section">
        <Link
          className="button"
          href="/me/notifications"
          data-testid="open-notifications"
        >
          {t("notifications.title")}
        </Link>
        <p className="section-hint">{t("pwa.cacheHint")}</p>
      </section>
    </>
  );
}
