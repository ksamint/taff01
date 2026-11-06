import { expect, it } from "vitest";
import { oauthReturnPath } from "./oauth-return";

const query = new URLSearchParams({
  response_type: "code",
  client_id: "client",
  redirect_uri: "https://client.example/callback",
  code_challenge: "A".repeat(43),
  code_challenge_method: "S256",
  state: "original & state",
  scope: "tasks:read",
});
it("returns the original valid consent request without losing state or PKCE", () => {
  const path = `/oauth/authorize?${query}`;
  expect(oauthReturnPath(path)).toBe(path);
});
it.each([
  null,
  "/orgs",
  "//client.example/oauth/authorize",
  "https://client.example/oauth/authorize",
  "/oauth/authorize?response_type=token",
  `/oauth/authorize?${query}#fragment`,
])("rejects an unrelated or invalid return path %s", (value) => {
  expect(oauthReturnPath(value)).toBeNull();
});
