/**
 * An invitation link carries its token in the URL fragment so it never reaches
 * a server log. The fragment is removed before React hydrates: the app router
 * copies the hash it finds at start-up into its own route state, and a later
 * navigation back to the same page would restore it from there.
 */
export const inviteBootScript = `try{var i=new URLSearchParams(location.hash.slice(1)).get("invite");if(i){window.__taffInvite=i;history.replaceState(null,"",location.pathname+location.search);}}catch(e){}`;

declare global {
  interface Window {
    __taffInvite?: string;
  }
}

/** Reads the token once; the fragment path covers a hash set after start-up. */
export function takeInviteToken(): string | null {
  const booted = window.__taffInvite ?? null;
  delete window.__taffInvite;
  if (booted) return booted;
  const token = new URLSearchParams(window.location.hash.slice(1)).get(
    "invite",
  );
  if (token)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  return token;
}
