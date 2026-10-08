import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "../src/components/providers";
import { themeBootScript } from "../src/lib/theme";
import "./globals.css";

export const metadata: Metadata = { title: "Taff" };
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
