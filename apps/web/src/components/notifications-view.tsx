"use client";
import type { NotificationPreferences } from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
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
    <label key={key} className="notification-preference">
      <span>
        <strong>{t(`notifications.${key}`)}</strong>
        <span className="section-hint">{t(`notifications.${key}Hint`)}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        data-testid={`notification-${key}`}
        checked={preferences.data?.[key] ?? false}
        disabled={busy || !preferences.data}
        onChange={(event) => change({ [key]: event.target.checked })}
      />
    </label>
  );
  return (
    <>
      <Link className="text-link" href="/me">
        {t("agentProfile.back")}
      </Link>
      <section className="page-heading">
        <h1>{t("notifications.title")}</h1>
        <p className="task-count">{t("notifications.delivery")}</p>
      </section>
      {preferences.isPending && <p aria-live="polite">{t("loading")}</p>}
      {(preferences.error || update.error) && (
        <div className="alert" role="alert">
          <p>{t(errorKey(update.error ?? preferences.error))}</p>
          <Button onClick={() => void preferences.refetch()} disabled={busy}>
            {t("retry")}
          </Button>
        </div>
      )}
      <section className="me-section" aria-labelledby="notification-categories">
        <h2 id="notification-categories">{t("notifications.foreground")}</h2>
        {categories.map(row)}
        <p className="section-hint">{t("notifications.inboxNote")}</p>
      </section>
      <section className="me-section" aria-labelledby="notification-digest">
        <h2 id="notification-digest">{t("notifications.digest")}</h2>
        {row("digest")}
        {preferences.data?.digest && (
          <fieldset className="notification-times" disabled={busy}>
            <legend>{t("notifications.time")}</legend>
            <div className="radio-row">
              {(["08:00", "09:00", "18:00"] as const).map((time) => (
                <label key={time}>
                  <input
                    type="radio"
                    name="digest-time"
                    value={time}
                    data-testid={`notification-time-${time}`}
                    checked={preferences.data?.digestAt === time}
                    onChange={() => change({ digestAt: time })}
                  />
                  {time}
                </label>
              ))}
            </div>
            <p className="section-hint">{me.user.tz}</p>
          </fieldset>
        )}
        <Link
          className="button button-quiet"
          href="/digests"
          data-testid="open-digests"
        >
          {t("notifications.history")}
        </Link>
      </section>
      <section className="me-section" aria-labelledby="notification-quiet">
        <h2 id="notification-quiet">{t("notifications.quietTitle")}</h2>
        {row("quiet")}
      </section>
      <section className="me-section" aria-labelledby="notification-device">
        <h2 id="notification-device">{t("notifications.device")}</h2>
        <p className="section-hint">{t("notifications.deviceHint")}</p>
        {permission === "denied" || permission === "unavailable" ? (
          <p role="status">{t(`notifications.${permission}`)}</p>
        ) : (
          <Button
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
      </section>
      <section className="me-section">
        <p className="section-hint">{t("pwa.cacheHint")}</p>
      </section>
    </>
  );
}
