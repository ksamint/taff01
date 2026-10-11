/**
 * An invitation link carries its token in the URL fragment so it never reaches
 * a server log. The fragment is removed before React hydrates: the app router
 * copies the hash it finds at start-up into its own route state, and a later
 * navigation back to the same page would restore it from there.
 */
export const inviteBootScript = `try{var p=new URLSearchParams(location.hash.slice(1)),i=p.get("invite"),v=p.get("verifyEmail");if(i)window.__taffInvite=i;if(v)window.__taffVerifyEmail=v;if(i||v)history.replaceState(null,"",location.pathname+location.search);}catch(e){}`;

declare global {
  interface Window {
    __taffInvite?: string;
    __taffVerifyEmail?: string;
  }
}

/** Reads the token once; the fragment path covers a hash set after start-up. */
export function takeInviteToken(): string | null {
  captureFragments();
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

function captureFragments() {
  const values = new URLSearchParams(window.location.hash.slice(1));
  const invite = values.get("invite");
  const verify = values.get("verifyEmail");
  if (invite) window.__taffInvite = invite;
  if (verify) window.__taffVerifyEmail = verify;
  if (invite || verify)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
}

export function takeEmailVerificationToken(): string | null {
  captureFragments();
  const token = window.__taffVerifyEmail ?? null;
  delete window.__taffVerifyEmail;
  return token;
}
