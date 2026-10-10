"use client";
import type { NotificationPreferences } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import {
  deviceAlertsEnabled,
  setDeviceAlertsEnabled,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../lib/notification-queries";
import { m3MutationKey } from "../lib/optimistic-m3";
import "../styles/notifications.css";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

const categories = ["review", "block", "mention", "done"] as const;
export function NotificationsView() {
  const { me } = useWorkspace();
  const { t } = useTranslation();
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [device, setDevice] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unavailable"
  >("unavailable");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    setDevice(deviceAlertsEnabled(me.user.id));
    setPermission(
      typeof Notification === "undefined"
        ? "unavailable"
        : Notification.permission,
    );
  }, [me.user.id]);
  const change = (patch: Partial<NotificationPreferences>) => {
    if (preferences.data && !busy)
      update.mutate({ ...preferences.data, ...patch });
  };
  const row = (
    key: "review" | "block" | "mention" | "done" | "digest" | "quiet",
  ) => (
    <Label key={key} className="notification-preference">
      <span>
        <strong>{t(`notifications.${key}`)}</strong>
        <span className="section-hint">{t(`notifications.${key}Hint`)}</span>
      </span>
      <Switch
        data-testid={`notification-${key}`}
        checked={preferences.data?.[key] ?? false}
        aria-checked={preferences.data?.[key] ?? false}
        disabled={busy || !preferences.data}
        onChange={(event) => change({ [key]: event.target.checked })}
      />
    </Label>
  );
  return (
    <div className="notifications-parity">
      <div className="notifications-toolbar">
        <Link className="back-link" href="/me">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("agentProfile.back")}
        </Link>
      </div>
      <div className="notifications-body">
        <h1>{t("notifications.title")}</h1>
        {preferences.isPending && <p aria-live="polite">{t("loading")}</p>}
        {(preferences.error || update.error) && (
          <div className="alert" role="alert">
            <p>{t(errorKey(update.error ?? preferences.error))}</p>
            <Button
              type="button"
              onClick={() => void preferences.refetch()}
              disabled={busy}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        <section
          className="notification-section"
          aria-labelledby="notification-categories"
        >
          <h2 id="notification-categories">{t("notifications.foreground")}</h2>
          <div className="notification-rows">{categories.map(row)}</div>
        </section>
        <section
          className="notification-section"
          aria-labelledby="notification-digest"
        >
          <h2 id="notification-digest">{t("notifications.digest")}</h2>
          <div className="notification-rows">
            {row("digest")}
            {preferences.data?.digest && (
              <fieldset
                className="notification-times"
                disabled={busy}
                aria-describedby="notification-time-zone"
              >
                <legend className="sr-only">{t("notifications.time")}</legend>
                <span className="notification-time-label">
                  <span aria-hidden="true">{t("notifications.time")}</span>
                  <small id="notification-time-zone">{me.user.tz}</small>
                </span>
                <div className="notification-time-options">
                  {(["08:00", "09:00", "18:00"] as const).map((time) => (
                    <Label key={time} className="notification-time-option">
                      <input
                        type="radio"
                        name="digest-time"
                        value={time}
                        data-testid={`notification-time-${time}`}
                        checked={preferences.data?.digestAt === time}
                        onChange={() => change({ digestAt: time })}
                      />
                      <span>{time}</span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </section>
        <section
          className="notification-section"
          aria-labelledby="notification-quiet"
        >
          <h2 id="notification-quiet">{t("notifications.quietTitle")}</h2>
          <div className="notification-rows">{row("quiet")}</div>
        </section>
        <p className="notification-note">
          {t("notifications.inboxNote")} {t("notifications.delivery")}
        </p>
        <div className="notification-secondary">
          <Link
            className="notification-history-link"
            href="/digests"
            data-testid="open-digests"
          >
            {t("notifications.history")}
          </Link>
          <details
            className="notification-device-details"
            data-testid="notification-device-details"
          >
            <summary>{t("notifications.device")}</summary>
            <p className="section-hint">{t("notifications.deviceHint")}</p>
            {permission === "denied" || permission === "unavailable" ? (
              <p role="status">{t(`notifications.${permission}`)}</p>
            ) : (
              <Button
                type="button"
                data-testid="notification-device"
                disabled={asking}
                onClick={async () => {
                  if (device) {
                    setDeviceAlertsEnabled(me.user.id, false);
                    setDevice(false);
                    return;
                  }
                  setAsking(true);
                  try {
                    const answer = await Notification.requestPermission();
                    setPermission(answer);
                    if (answer === "granted") {
                      setDeviceAlertsEnabled(me.user.id, true);
                      setDevice(true);
                    }
                  } catch {
                    setPermission("unavailable");
                  } finally {
                    setAsking(false);
                  }
                }}
              >
                {t(
                  device
                    ? "notifications.disableDevice"
                    : "notifications.enableDevice",
                )}
              </Button>
            )}
            <p className="section-hint">{t("pwa.cacheHint")}</p>
          </details>
        </div>
      </div>
    </div>
  );
}
