"use client";

import type { Locale, Me } from "@taff/schemas";
import { profileSchema } from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarDays,
  Inbox,
  LayoutGrid,
  Plus,
  Search,
  Sun,
  User,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
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
import {
  sessionMatches,
  sessionVersion,
  subscribeSession,
  synchronizeSession,
  workspaceFingerprint,
} from "../lib/session-cache";
import { useWorkspaceSelection } from "./providers";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

const SearchDialog = dynamic(
  () => import("./search-dialog").then((module) => module.SearchDialog),
  { ssr: false },
);
const Auth = dynamic(() => import("./auth").then((module) => module.Auth), {
  ssr: false,
});
const QuickAddDialog = dynamic(
  () => import("./quick-add-dialog").then((module) => module.QuickAddDialog),
  { ssr: false },
);
const NotificationAlerts = dynamic(
  () =>
    import("./notification-alerts").then((module) => module.NotificationAlerts),
  { ssr: false },
);

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
        prefetch={false}
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
  const [overlay, setOverlay] = useState<"search" | "quick" | null>(null);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOverlay("search");
      }
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);
  const {
    id: workspaceId,
    setId: setWorkspaceId,
    invitation,
    setInvitation,
  } = useWorkspaceSelection();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const me = useMeQuery();
  const userId = me.data?.user.id ?? null;
  const scope = me.data ? workspaceFingerprint(me.data) : "";
  const identityKey = `${userId ?? "signed-out"}:${scope}`;
  useSyncExternalStore(
    (listener) => subscribeSession(client, listener),
    () => sessionVersion(client),
    () => 0,
  );
  const identityReady = sessionMatches(client, userId, scope);
  const selectionUser = useRef<string | null>(null);
  useEffect(() => {
    if (!me.data || !identityReady) return;
    try {
      const key = `taff:workspace:${me.data.user.id}`;
      if (selectionUser.current !== me.data.user.id) {
        selectionUser.current = me.data.user.id;
        const saved = window.sessionStorage.getItem(key);
        if (saved && me.data.workspaces.some((item) => item.id === saved)) {
          setWorkspaceId(saved);
          return;
        }
      }
      const selected =
        me.data.workspaces.find((item) => item.id === workspaceId) ??
        me.data.workspaces[0];
      if (selected) window.sessionStorage.setItem(key, selected.id);
    } catch {
      /* The current page selection still works when storage is blocked. */
    }
  }, [me.data, identityReady, workspaceId, setWorkspaceId]);
  const busy = useIsMutating() > 0;
  useEffect(() => {
    if (me.isPending || me.isError || me.isFetching) return;
    synchronizeSession(client, userId, scope);
  }, [
    client,
    userId,
    scope,
    me.isPending,
    me.isError,
    me.isFetching,
    me.dataUpdatedAt,
  ]);
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
          {me.data && (
            <>
              <Button
                data-testid="open-search"
                className="button-quiet"
                aria-label={t("search.title")}
                onClick={() => setOverlay("search")}
              >
                <Search size={20} aria-hidden="true" />
              </Button>
              <Button
                data-testid="open-quick"
                className="button-quiet"
                aria-label={t("quickAdd.title")}
                onClick={() => setOverlay("quick")}
              >
                <Plus size={20} aria-hidden="true" />
              </Button>
            </>
          )}
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
          {invitation && (
            <p className="invite-banner">
              {t("organization.acceptHint")}{" "}
              <Button
                className="button-quiet"
                onClick={() => setInvitation(null)}
              >
                {t("organization.dismiss")}
              </Button>
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
            {invitation && pathname !== "/orgs" && (
              <p className="invite-banner">
                <Link href="/orgs" className="text-link">
                  {t("organization.accept")}
                </Link>
              </p>
            )}
            {children}
            <NotificationAlerts key={`${identityKey}:${workspace.id}`} />
            {overlay === "search" && (
              <SearchDialog
                key={workspace.id}
                onClose={() => setOverlay(null)}
              />
            )}
            {overlay === "quick" && (
              <QuickAddDialog
                key={workspace.id}
                onClose={() => setOverlay(null)}
              />
            )}
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
