import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import english from "../locales/en/common.json";
import { Providers } from "../src/components/providers";
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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Providers english={english}>{children}</Providers>
      </body>
    </html>
  );
}
