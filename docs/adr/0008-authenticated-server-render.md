# 0008 — Render the authenticated Today greeting on the server

## Context

The production greeting waits for client framework initialization even though
the existing session preload finishes much earlier. The unchanged Lighthouse
gate still fails in Chinese. A cold capture measures the greeting at 3,096 ms;
moving or memoizing its first Intl construction does not establish a saving.

## Decision

RootLayout reads the cookie-authenticated `/api/bootstrap` endpoint through
the configured internal API URL, with no cache, no redirects and a two-second
timeout. Core authenticates that lookup without renewing the session; browser
`/api/me` retains renewal and its Set-Cookie. The shared Me schema validates
the result. Only Me is serialized, never the session token or auth record.
Unavailable bootstrap falls back to the existing client loading behavior.

The server result seeds a provisional query client with timestamp zero. Today
can render its greeting, but its protected reads are disabled until the fresh
browser Me response confirms identity. Other protected routes remain gated.
Chrome and provisional content are inert; mutation snapshots, profile effects,
locale/workspace persistence, IndexedDB, realtime and notifications also wait.
Confirmation purges provisional protected queries, including for the same
identity, before normal behavior resumes. Error recovery stays interactive.

## Consequences

The web runtime needs `API_INTERNAL_URL`, supplied by production Compose.
Private HTML must remain uncached. Existing Me, locale and workspace preloads,
client reconciliation, validation, optional fonts and the 20-card fixture stay
in place. Account replacement during hydration, failed browser reads, session
renewal and all unchanged performance/browser gates must pass before adoption.
No dependency or framework version changes. Candidate `d06d2fc4` passed all
nine checks, including the aged-session renewal regression and all nine
account replacement/retry browser cases, plus the unchanged Lighthouse/LCP
checks and both exact-commit GitHub CI runs. The server render is accepted.
