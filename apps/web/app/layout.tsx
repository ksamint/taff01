import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import english from "../locales/en/common.json";
import simplified from "../locales/zh-CN/common.json";
import traditional from "../locales/zh-HK/common.json";
import { AppShell } from "../src/components/app-shell";
import { Providers } from "../src/components/providers";
import { htmlLang, isLocale, preloadBootScript } from "../src/lib/i18n";
import { readServerMe } from "../src/lib/server-me";
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
  const initialMe = await readServerMe(
    sessionCookie,
    process.env.API_INTERNAL_URL,
  );
  const preference =
    initialMe?.user.locale ?? cookieStore.get("taff-locale")?.value;
  const initialLocale = isLocale(preference) ? preference : null;
  const locale = initialLocale ?? "en";
  const messages = { en: english, "zh-CN": simplified, "zh-HK": traditional };
  return (
    <html lang={htmlLang(locale)} suppressHydrationWarning>
      <head>
        {/* Browser confirmation gates protected reads and writes; it starts
            with the HTML instead of after the JavaScript has run. The CJK
            face is font-display: optional and is not preloaded: on a slow
            first visit it must not take bandwidth from the scripts. */}
        <link rel="preload" href="/api/me" as="fetch" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              themeBootScript +
              preloadBootScript(
                process.env.NEXT_PUBLIC_ASSET_VERSION ?? "dev",
                locale,
              ),
          }}
        />
        <Providers
          initialLocale={initialLocale}
          messages={messages[locale]}
          initialMe={initialMe}
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
