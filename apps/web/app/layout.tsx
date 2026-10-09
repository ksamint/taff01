import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import english from "../locales/en/common.json";
import simplified from "../locales/zh-CN/common.json";
import traditional from "../locales/zh-HK/common.json";
import { Providers } from "../src/components/providers";
import { htmlLang, isLocale, preloadBootScript } from "../src/lib/i18n";
import { themeBootScript } from "../src/lib/theme";
import "./globals.css";

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
}: {
  children: ReactNode;
}) {
  const preference = (await cookies()).get("taff-locale")?.value;
  const initialLocale = isLocale(preference) ? preference : null;
  const locale = initialLocale ?? "en";
  const messages = { en: english, "zh-CN": simplified, "zh-HK": traditional };
  // The session request gates every signed-in view; start it with the HTML
  // instead of after the JavaScript has downloaded and run.
  preload("/api/me", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <html lang={htmlLang(locale)} suppressHydrationWarning>
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
        <Providers initialLocale={initialLocale} messages={messages[locale]}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
