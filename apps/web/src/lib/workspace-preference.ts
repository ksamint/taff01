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
