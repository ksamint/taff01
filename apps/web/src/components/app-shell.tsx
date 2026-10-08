"use client";

import type { Locale, Me } from "@taff/schemas";
import { profileSchema } from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { CalendarDays, Inbox, LayoutGrid, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { savePreference } from "../lib/i18n";
import { useInbox } from "../lib/m3-queries";
import { m3MutationKey } from "../lib/optimistic-m3";
import { meKey, useMeQuery } from "../lib/queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../lib/query-snapshot";
import { connectWorkspace } from "../lib/realtime";
import { sessionMatches, synchronizeSession } from "../lib/session-cache";
import { Auth } from "./auth";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

type Workspace = Me["workspaces"][number];
type WorkspaceValue = {
  me: Me;
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  setLocale: (locale: Locale) => void;
  localePending: boolean;
};
const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace needs AppShell");
  return value;
}

const NAV = [
  { href: "/", key: "today", Icon: Sun },
  { href: "/calendar", key: "calendar", Icon: CalendarDays },
  { href: "/projects", key: "projects", Icon: LayoutGrid },
  { href: "/inbox", key: "inbox", Icon: Inbox },
  { href: "/me", key: "me", Icon: User },
] as const;

function Wordmark({ label }: { label: string }) {
  return (
    <Link className="wordmark" href="/" aria-label={label}>
      <span className="brand-mark" aria-hidden="true">
        T
      </span>
      {label}
    </Link>
  );
}

function NavItems({
  pathname,
  t,
  workspaceId,
}: {
  pathname: string;
  t: (k: string) => string;
  workspaceId?: string;
}) {
  return NAV.map(({ href, key, Icon }) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className="tab"
        aria-current={active ? "page" : undefined}
      >
        <Icon aria-hidden="true" strokeWidth={1.5} />
        {t(`nav.${key}`)}
        {key === "inbox" && workspaceId && (
          <InboxBadge workspaceId={workspaceId} />
        )}
      </Link>
    );
  });
}

function InboxBadge({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation();
  const inbox = useInbox(workspaceId);
  const count = inbox.data?.unreadCount ?? 0;
  return count > 0 ? (
    <span
      data-testid="inbox-badge"
      className="nav-badge"
      aria-label={t("inbox.unread", { count })}
    >
      {new Intl.NumberFormat(i18n.resolvedLanguage).format(count)}
    </span>
  ) : null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const pathname = usePathname();
  const [workspaceId, setWorkspaceId] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const me = useMeQuery();
  const userId = me.data?.user.id ?? null;
  const scope =
    me.data?.workspaces
      .map(({ id }) => id)
      .sort()
      .join(",") ?? "";
  const identityKey = `${userId ?? "signed-out"}:${scope}`;
  const [checkedIdentity, setCheckedIdentity] = useState<
    string | null | undefined
  >(undefined);
  const identityReady =
    checkedIdentity === identityKey && sessionMatches(client, userId, scope);
  const busy = useIsMutating() > 0;
  useEffect(() => {
    if (me.isPending || me.isError) return;
    synchronizeSession(client, userId, scope);
    setCheckedIdentity(identityKey);
  }, [client, userId, scope, identityKey, me.isPending, me.isError]);
  useEffect(() => {
    if (me.data) {
      void i18n.changeLanguage(me.data.user.locale);
      savePreference(me.data.user.locale);
    }
  }, [me.data?.user.locale, i18n]);
  const profile = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (locale: Locale) =>
      request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(
          profileSchema.parse({ locale, tz: me.data?.user.tz }),
        ),
      }),
    onMutate: async (locale) => {
      const snapshot = await snapshotQueries(client, [meKey]);
      const previous = i18n.language;
      client.setQueryData<Me | null>(meKey, (current) =>
        current ? { ...current, user: { ...current.user, locale } } : current,
      );
      setSessionError(null);
      void i18n.changeLanguage(locale);
      return { previous, snapshot };
    },
    onSuccess: (_, locale, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      savePreference(locale);
      client.setQueryData<Me | null>(meKey, (current) =>
        current ? { ...current, user: { ...current.user, locale } } : current,
      );
    },
    onError: (_, __, context) => {
      if (!isCurrentSnapshot(client, context?.snapshot)) return;
      restoreQueries(client, context?.snapshot);
      void i18n.changeLanguage(context?.previous ?? "en");
      setSessionError("errors.profile");
    },
    onSettled: () => client.invalidateQueries({ queryKey: meKey }),
  });
  const signOut = useMutation({
    mutationFn: () =>
      request("/api/auth/sign-out", { method: "POST", body: "{}" }),
    onSuccess: () => {
      synchronizeSession(client, null);
      client.clear();
      client.setQueryData(meKey, null);
      setWorkspaceId("");
      setSessionError(null);
    },
    onError: (error) => setSessionError(errorKey(error)),
  });
  const setLocale = (locale: Locale) => {
    if (me.data) profile.mutate(locale);
    else {
      void i18n.changeLanguage(locale);
      savePreference(locale);
    }
  };
  const workspace =
    me.data?.workspaces.find(({ id }) => id === workspaceId) ??
    me.data?.workspaces[0];
  useEffect(() => {
    if (identityReady && workspace && me.data)
      return connectWorkspace(client, workspace.id, me.data.user.id);
  }, [client, workspace?.id, me.data?.user.id, identityReady]);
  return (
    <div className="app-shell">
      {me.data && (
        <aside className="sidebar">
          <Wordmark label={t("app")} />
          <nav aria-label={t("nav.label")}>
            <NavItems pathname={pathname} t={t} workspaceId={workspace?.id} />
          </nav>
        </aside>
      )}
      <header className="topbar">
        <Wordmark label={t("app")} />
        <div className="header-actions">
          <Label htmlFor="locale-select">
            <span className="sr-only">{t("language")}</span>
          </Label>
          <select
            id="locale-select"
            data-testid="locale-select"
            className="language-select"
            value={i18n.resolvedLanguage ?? "en"}
            disabled={busy || me.isPending}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="en">{t("en")}</option>
            <option value="zh-CN">{t("zh-CN")}</option>
            <option value="zh-HK">{t("zh-HK")}</option>
          </select>
          {me.data && (
            <Button
              className="button-quiet"
              disabled={busy}
              onClick={() => signOut.mutate()}
            >
              {t("signOut")}
            </Button>
          )}
        </div>
      </header>
      {me.isPending || (!identityReady && !me.isError) ? (
        <main className="loading" aria-live="polite">
          {t("loading")}
        </main>
      ) : me.isError ? (
        <main className="loading">
          <p role="alert">{t(errorKey(me.error))}</p>
          <Button onClick={() => void me.refetch()}>{t("retry")}</Button>
        </main>
      ) : !me.data ? (
        <main className="content">
          {sessionError && (
            <p className="alert" role="alert">
              {t(sessionError)}
            </p>
          )}
          <Auth />
        </main>
      ) : workspace ? (
        <WorkspaceContext.Provider
          value={{
            me: me.data,
            workspace,
            setWorkspaceId,
            setLocale,
            localePending: profile.isPending,
          }}
        >
          <main className="content">
            {sessionError && (
              <p className="alert" role="alert">
                {t(sessionError)}
              </p>
            )}
            {children}
          </main>
        </WorkspaceContext.Provider>
      ) : (
        <main className="loading">{t("noWorkspace")}</main>
      )}
      <footer className="tagline">{t("tagline")}</footer>
      {me.data && (
        <nav className="tabbar" aria-label={t("nav.label")}>
          <NavItems pathname={pathname} t={t} workspaceId={workspace?.id} />
        </nav>
      )}
    </div>
  );
}
