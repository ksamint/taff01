import { type Me, meSchema } from "@taff/schemas/base";

// Session renewal belongs to the browser, which can receive its Set-Cookie.
export async function readServerMe(
  cookie: string,
  apiOrigin: string | undefined,
): Promise<Me | null | undefined> {
  if (!cookie) return null;
  if (!apiOrigin) return undefined;
  try {
    const response = await fetch(new URL("/api/bootstrap", apiOrigin), {
      headers: { Cookie: cookie },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 401) return null;
    if (!response.ok) return undefined;
    return meSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}
