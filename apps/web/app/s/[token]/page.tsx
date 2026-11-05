import { sharedSummarySchema } from "@taff/schemas";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "../../../src/components/print-button";
import { SummaryDocument } from "../../../src/components/summary-document";
import { htmlLang } from "../../../src/lib/i18n";
import { serverTranslator } from "../../../src/lib/server-translate";

// A share link (ADR 0027): rendered on the server for every request, outside
// the app shell, in the recipient's language and zone. The token goes to the
// API in a POST body, never in an API path or a log line.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Taff",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

async function readShared(token: string) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) return null;
  const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
  try {
    const response = await fetch(new URL("/api/shared-summary", api), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const parsed = sharedSummarySchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const summary = await readShared(token);
  if (!summary) notFound();
  const t = serverTranslator(summary.locale);
  return (
    <main
      className="shared-summary-page"
      lang={htmlLang(summary.locale)}
      data-testid="share-page"
    >
      <SummaryDocument
        snapshot={summary.snapshot}
        watermark={summary.watermark}
        contentHash={summary.contentHash}
        createdAt={summary.createdAt}
        locale={summary.locale}
        t={t}
        actions={<PrintButton label={t("summary.print")} />}
      />
    </main>
  );
}
