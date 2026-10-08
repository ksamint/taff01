import { createHash } from "node:crypto";
import en from "../../../locales/en/common.json";
import zhCN from "../../../locales/zh-CN/common.json";
import zhHK from "../../../locales/zh-HK/common.json";

const resources = { en, "zh-CN": zhCN, "zh-HK": zhHK };
export const dynamic = "force-static";
export function generateStaticParams() {
  return Object.keys(resources).map((locale) => ({ locale }));
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!Object.hasOwn(resources, locale))
    return new Response(null, { status: 404 });
  const body = JSON.stringify(resources[locale as keyof typeof resources]);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ETag: `"${createHash("sha256").update(body).digest("hex")}"`,
    },
  });
}
