import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OAuthConsentView } from "./oauth-consent-view";

const query = vi.hoisted(() =>
  new URLSearchParams({
    response_type: "code",
    client_id: "00000000-0000-4000-8000-000000000001",
    redirect_uri: "https://client.example/callback",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    state: "return-state&with=query",
    scope: "tasks:read",
  }).toString(),
);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      client: { name: "Client", redirectHost: "client.example" },
      scopes: ["tasks:read"],
      workspaces: [
        {
          id: "workspace",
          name: "Organization",
          agents: [],
          allowedScopes: ["tasks:read"],
        },
      ],
    },
  }),
}));

it("links no-agent guidance to organization management with the full OAuth request", () => {
  const html = renderToStaticMarkup(createElement(OAuthConsentView));
  const target = `/orgs?oauthReturn=${encodeURIComponent(`/oauth/authorize?${query}`)}`;
  expect(html).toContain(`href="${target}"`);
  expect(html).toContain("oauth.manageOrganizations");
  expect(html).toContain('data-testid="oauth-no-agent"');
});
