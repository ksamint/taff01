export type ThemePreference = "light" | "dark" | "system";

const KEY = "taff-theme";

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    /* Storage may be disabled. */
  }
}

/** Runs before paint so a dark preference never flashes light. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}try{var m=matchMedia("(prefers-color-scheme: dark)");var u=function(){document.body.dataset.prefersDark=String(m.matches)};u();m.addEventListener("change",u);}catch(e){}`;
