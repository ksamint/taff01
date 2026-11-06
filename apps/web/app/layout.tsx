import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import english from "../locales/en/common.json";
import simplified from "../locales/zh-CN/common.json";
import traditional from "../locales/zh-HK/common.json";
import { AppShell } from "../src/components/app-shell";
import { Providers } from "../src/components/providers";
import {
  acceptedLanguages,
  detectLocale,
  htmlLang,
  isLocale,
  preloadBootScript,
} from "../src/lib/i18n";
import { inviteBootScript } from "../src/lib/invite";
import {
  readServerToday,
  workspacePreferenceCookie,
} from "../src/lib/server-me";
import { themeBootScript } from "../src/lib/theme";
import "./globals.css";
import "../src/styles/notifications.css";

export const metadata: Metadata = {
  title: "Taff",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/taff-192.png",
    apple: "/icons/taff-192.png",
  },
  appleWebApp: { capable: true, title: "Taff" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1626" },
  ],
};
export default async function RootLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal?: ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore
    .getAll()
    .filter(({ name }) =>
      [
        "better-auth.session_token",
        "__Secure-better-auth.session_token",
      ].includes(name),
    )
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  const bootstrap = await readServerToday(
    sessionCookie,
    process.env.API_INTERNAL_URL,
    cookieStore.get(workspacePreferenceCookie)?.value,
  );
  const initialMe =
    bootstrap === undefined ? undefined : (bootstrap?.me ?? null);
  const initialToday = bootstrap?.today;
  const preference =
    initialMe?.user.locale ?? cookieStore.get("taff-locale")?.value;
  const initialLocale = isLocale(preference) ? preference : null;
  // Without a saved choice, render the language the browser will pick.
  const locale =
    initialLocale ??
    detectLocale(acceptedLanguages((await headers()).get("accept-language")));
  const messages = { en: english, "zh-CN": simplified, "zh-HK": traditional };
  return (
    <html lang={htmlLang(locale)} suppressHydrationWarning>
      <head>
        {/* Optional CJK fonts must not outrank app scripts on cold visits. */}
        {locale !== "en" && (
          <link
            rel="preload"
            as="font"
            type="font/woff2"
            href="/fonts/NotoSansTC-ui-common.woff2"
            crossOrigin="anonymous"
            fetchPriority="low"
          />
        )}
        {/* Confirmation must read current authority; fetch preloads can reuse errors or stale roles. */}
      </head>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              themeBootScript +
              inviteBootScript +
              preloadBootScript(
                process.env.NEXT_PUBLIC_ASSET_VERSION ?? "dev",
                locale,
              ),
          }}
        />
        <Providers
          initialLocale={initialLocale}
          messagesLocale={locale}
          messages={messages[locale]}
          initialMe={initialMe}
          initialToday={initialToday}
        >
          <AppShell>
            {children}
            {modal}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
