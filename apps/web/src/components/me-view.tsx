"use client";

import type { Locale } from "@taff/schemas/base";
import { presentPrototypeField } from "@taff/schemas/prototype-data";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Languages,
  LogOut,
  Moon,
  Plug,
  Settings2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useNotificationPreferences } from "../lib/notification-preferences";
import { useMembers } from "../lib/queries";
import { applyTheme, readTheme, type ThemePreference } from "../lib/theme";
import { useWorkspace } from "./app-shell";
import { OrganizationChooser } from "./organization-chooser";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const LANGUAGES: Locale[] = ["zh-HK", "zh-CN", "en"];
const THEMES: ThemePreference[] = ["light", "dark", "system"];
/** Every zone the browser knows, with the saved one first when it is unknown here. */
function timeZones(current: string): string[] {
  let known: string[] = [];
  try {
    known = Intl.supportedValuesOf("timeZone");
  } catch {
    known = ["UTC"];
  }
  return known.includes(current) ? known : [current, ...known];
}

// Port of the prototype Me markup, team-tasks.dc.html lines 323–375.
export function MeView() {
  const {
    me,
    workspace,
    setWorkspaceId,
    setLocale,
    setTimeZone,
    localePending,
    profileError,
    signOut,
    signOutPending,
  } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const members = useMembers(workspace.id);
  const preferences = useNotificationPreferences();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [sheet, setSheet] = useState<"organization" | "advanced" | null>(null);
  useEffect(() => setTheme(readTheme()), []);
  const changeTheme = (next: ThemePreference) => {
    setTheme(next);
    applyTheme(next);
  };
  const workspaceName = presentPrototypeField(
    workspace.id,
    "name",
    workspace.name,
    locale,
  );
  const format = new Intl.NumberFormat(locale);
  const teamSummary = members.data
    ? t("me.teamSummary", {
        people: format.format(
          members.data.filter((member) => member.kind === "person").length,
        ),
        agents: format.format(
          members.data.filter((member) => member.kind === "agent").length,
        ),
      })
    : members.error
      ? t(errorKey(members.error))
      : t("loading");
  const categories = ["review", "block", "mention", "done"] as const;
  const activeCategories = preferences.data
    ? categories.filter((key) => preferences.data?.[key]).length
    : 0;
  const notificationSummary = preferences.data
    ? [
        activeCategories
          ? t("me.notificationSummary", { count: activeCategories })
          : t("me.notificationsOff"),
        preferences.data.digest
          ? t("me.digestSummary", { time: preferences.data.digestAt })
          : null,
        preferences.data.quiet ? t("notifications.quiet") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : preferences.error
      ? t(errorKey(preferences.error))
      : t("loading");
  const appearance = theme === "system" ? undefined : theme;
  return (
    <section className="me-view">
      <h1 className="me-title">{t("me.title")}</h1>
      <div className="me-profile">
        <span className="me-avatar" aria-hidden="true">
          {Array.from(me.user.name.trim()).slice(0, 1).join("").toUpperCase()}
        </span>
        <div className="me-profile-copy">
          <strong>{me.user.name}</strong>
          <span>
            {t(`organization.${workspace.role}`)} · {workspaceName}
          </span>
        </div>
      </div>
      <div className="me-rows">
        <Button
          type="button"
          className="me-row-control"
          data-testid="me-organization"
          onClick={() => setSheet("organization")}
        >
          <span className="me-workspace-mark" aria-hidden="true">
            {Array.from(workspaceName).slice(0, 1).join("")}
          </span>
          <span className="me-row-label">{t("organization.title")}</span>
          <span className="me-row-value">{workspaceName}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
        <Link
          className="me-row-control"
          href="/orgs#team"
          prefetch={false}
          data-testid="me-team"
        >
          <Users size={20} aria-hidden="true" />
          <span className="me-row-label">{t("organization.team")}</span>
          <span className="me-row-value">{teamSummary}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link
          className="me-row-control"
          href="/me/mcp"
          prefetch={false}
          data-testid="open-mcp"
        >
          <Plug size={20} aria-hidden="true" />
          <span className="me-row-label">{t("me.settings")} › MCP</span>
          <span className="me-row-value">{t("mcp.open")}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <h2 id="preferences-heading" className="me-section-label">
        {t("me.preferences")}
      </h2>
      <div className="me-rows">
        <div className="me-preference-row">
          <Languages size={20} aria-hidden="true" />
          <span id="me-language-label" className="me-row-label">
            {t("language")}
          </span>
          <div
            className="me-segmented"
            data-testid="locale-select"
            role="group"
            aria-labelledby="me-language-label"
          >
            {LANGUAGES.map((value) => (
              <Button
                type="button"
                key={value}
                aria-pressed={locale === value}
                disabled={localePending}
                onClick={() => setLocale(value)}
              >
                {t(
                  value === "zh-HK"
                    ? "me.languageHK"
                    : value === "zh-CN"
                      ? "me.languageCN"
                      : "en",
                )}
              </Button>
            ))}
          </div>
        </div>
        <div className="me-preference-row">
          <Moon size={20} aria-hidden="true" />
          <span id="me-appearance-label" className="me-row-label">
            {t("me.appearance")}
          </span>
          <div
            className="me-segmented"
            role="group"
            aria-labelledby="me-appearance-label"
          >
            {(["light", "dark"] as const).map((value) => (
              <Button
                type="button"
                key={value}
                data-testid={`theme-${value}`}
                aria-pressed={appearance === value}
                onClick={() => changeTheme(value)}
              >
                {t(`me.${value}`)}
              </Button>
            ))}
          </div>
        </div>
        <Link
          className="me-row-control me-notification-row"
          href="/me/notifications"
          prefetch={false}
          data-testid="open-notifications"
        >
          <Bell size={20} aria-hidden="true" />
          <span className="me-notification-copy">
            <span className="me-row-label">{t("notifications.title")}</span>
            <span className="me-row-summary">{notificationSummary}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Button
          type="button"
          className="me-row-control"
          data-testid="me-advanced"
          onClick={() => setSheet("advanced")}
        >
          <Settings2 size={20} aria-hidden="true" />
          <span className="me-row-label">{t("me.advanced")}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <Button
        type="button"
        className="me-row-control me-signout"
        onClick={signOut}
        disabled={signOutPending}
      >
        <LogOut size={20} aria-hidden="true" />
        <span className="me-row-label">{t("signOut")}</span>
      </Button>
      {sheet === "organization" && (
        <SheetDialog
          title={t("organization.switch")}
          className="organization-sheet"
          onClose={() => setSheet(null)}
        >
          <OrganizationChooser
            testIdPrefix="me-workspace-"
            onSelect={(id) => {
              setWorkspaceId(id);
              setSheet(null);
            }}
          />
        </SheetDialog>
      )}
      {sheet === "advanced" && (
        <SheetDialog title={t("me.advanced")} onClose={() => setSheet(null)}>
          {profileError && (
            <p className="alert" role="alert">
              {t(profileError)}
            </p>
          )}
          <dl className="me-account-details">
            <dt>{t("name")}</dt>
            <dd>{me.user.name}</dd>
            <dt>{t("email")}</dt>
            <dd>{me.user.email}</dd>
          </dl>
          <div className="field">
            <Label htmlFor="me-tz">{t("me.timeZone")}</Label>
            <select
              id="me-tz"
              data-testid="me-tz"
              value={me.user.tz}
              disabled={localePending}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {timeZones(me.user.tz).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="field-hint">{t("me.timeZoneHint")}</p>
          </div>
          <fieldset className="me-theme-options">
            <legend>{t("me.appearance")}</legend>
            <div
              className="me-segmented"
              role="group"
              aria-label={t("me.appearance")}
            >
              {THEMES.map((value) => (
                <Button
                  type="button"
                  key={value}
                  data-testid={`advanced-theme-${value}`}
                  aria-pressed={theme === value}
                  onClick={() => changeTheme(value)}
                >
                  {t(`me.${value}`)}
                </Button>
              ))}
            </div>
          </fieldset>
          <p className="field-hint">{t("pwa.cacheHint")}</p>
        </SheetDialog>
      )}
    </section>
  );
}
