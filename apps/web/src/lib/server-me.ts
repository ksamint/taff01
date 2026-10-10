import { type Me, meSchema } from "@taff/schemas/base";
import {
  type TodayBootstrap,
  todayBootstrapQuerySchema,
  todayBootstrapSchema,
} from "@taff/schemas/today-bootstrap";

export { workspacePreferenceCookie } from "./workspace-preference";

// This is a presentation hint. Core validates it against the live identity and
// membership before reading any workspace, and it never grants access.
export async function readServerToday(
  cookie: string,
  apiOrigin: string | undefined,
  workspacePreference?: string,
): Promise<TodayBootstrap | null | undefined> {
  if (!cookie) return null;
  if (!apiOrigin) return undefined;
  try {
    const url = new URL("/api/bootstrap/today", apiOrigin);
    if (workspacePreference) {
      try {
        const choice = todayBootstrapQuerySchema.safeParse(
          JSON.parse(decodeURIComponent(workspacePreference)),
        );
        if (choice.success)
          for (const [name, value] of Object.entries(choice.data))
            if (value !== undefined) url.searchParams.set(name, value);
      } catch {
        // A malformed preference does not prevent an authenticated first paint.
      }
    }
    const response = await fetch(url, {
      headers: { Cookie: cookie },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 401) return null;
    // A rolling API/web upgrade can temporarily expose the old bootstrap only.
    if (response.status === 404) {
      const me = await readServerMe(cookie, apiOrigin);
      return me ? { me, today: null } : me;
    }
    if (!response.ok) return undefined;
    const text = await response.text();
    // Never put a partial collection in the full tasks cache. Large workspaces
    // keep the ordinary browser read path instead of inflating document data.
    if (text.length > 2_000_000) {
      const me = await readServerMe(cookie, apiOrigin);
      return me ? { me, today: null } : me;
    }
    return todayBootstrapSchema.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

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
