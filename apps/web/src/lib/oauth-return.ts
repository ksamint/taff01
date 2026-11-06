import { oauthAuthorizeSchema } from "@taff/schemas";

/** Only a valid same-app consent request may be offered as a return link. */
export function oauthReturnPath(value: string | null): string | null {
  if (!value?.startsWith("/oauth/authorize?") || value.includes("#"))
    return null;
  const params = new URLSearchParams(value.slice(value.indexOf("?") + 1));
  return oauthAuthorizeSchema.safeParse(Object.fromEntries(params)).success
    ? value
    : null;
}
