// A server-readable, account-scoped presentation hint. Session storage retains
// authority for an existing tab; the server must recheck this hint in live Me.
export function saveWorkspacePreference(userId: string, workspaceId: string) {
  try {
    const choice = {
      preferredUserId: userId,
      workspaceId,
    } satisfies TodayBootstrapQuery;
    const value = encodeURIComponent(JSON.stringify(choice));
    document.cookie = `${workspacePreferenceCookie}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // Workspace selection still works when presentation cookies are disabled.
  }
}

import type { TodayBootstrapQuery } from "@taff/schemas/today-bootstrap";

export const workspacePreferenceCookie = "taff-workspace";

/** Start every authenticated login from the saved server default. */
export function clearWorkspaceSession() {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("taff:workspace:"))
        window.sessionStorage.removeItem(key);
    }
    document.cookie = `${workspacePreferenceCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Storage may be blocked; server ordering still supplies a safe default.
  }
}
