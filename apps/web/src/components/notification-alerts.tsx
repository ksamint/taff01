"use client";
import {
  type InboxItem,
  shouldShowForegroundNotification,
} from "@taff/schemas";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInbox } from "../lib/m3-queries";
import {
  deviceAlertsEnabled,
  useNotificationPreferences,
} from "../lib/notification-queries";
import "../styles/notifications.css";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

export function NotificationAlerts() {
  const { me, workspace } = useWorkspace();
  const { t } = useTranslation();
  const inbox = useInbox(workspace.id);
  const preferences = useNotificationPreferences();
  const seen = useRef<Set<string> | null>(null);
  const devices = useRef<Notification[]>([]);
  const [alerts, setAlerts] = useState<InboxItem[]>([]);
  useEffect(
    () => () => {
      for (const notification of devices.current) notification.close();
    },
    [],
  );
  useEffect(() => {
    if (!inbox.data) return;
    if (!seen.current) {
      seen.current = new Set(inbox.data.items.map((item) => item.id));
      return;
    }
    if (!preferences.data) return;
    const fresh = inbox.data.items.filter(
      (item) => !seen.current!.has(item.id),
    );
    for (const item of fresh) seen.current.add(item.id);
    const visible = fresh.filter(
      (item) =>
        !item.readAt &&
        (!item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()) &&
        shouldShowForegroundNotification(
          preferences.data!,
          item.kind,
          new Date().toISOString(),
          me.user.tz,
        ),
    );
    if (!visible.length) return;
    setAlerts((current) => [...visible, ...current].slice(0, 3));
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      deviceAlertsEnabled(me.user.id)
    ) {
      for (const item of visible) {
        try {
          devices.current.push(
            new Notification(t(`inbox.kind.${item.kind}`), {
              body: item.title,
              tag: item.id,
              icon: "/icons/taff-192.png",
            }),
          );
        } catch {
          /* In-app alerts remain available when the platform rejects device alerts. */
        }
      }
    }
  }, [inbox.data, preferences.data, me.user.id, me.user.tz, t]);
  return alerts.length ? (
    <aside
      className="notification-alerts"
      aria-live="polite"
      aria-label={t("notifications.foreground")}
    >
      {alerts.map((item) => (
        <div
          className="notification-alert"
          key={item.id}
          role="status"
          data-testid="foreground-notification"
        >
          <div>
            <strong>{t(`inbox.kind.${item.kind}`)}</strong>
            <p>{item.title}</p>
            <Link href="/inbox" prefetch={false}>
              {t("inbox.title")}
            </Link>
          </div>
          <Button
            className="button-quiet"
            aria-label={t("planning.close")}
            onClick={() =>
              setAlerts((current) =>
                current.filter((value) => value.id !== item.id),
              )
            }
          >
            ×
          </Button>
        </div>
      ))}
    </aside>
  ) : null;
}
