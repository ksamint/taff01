# Realtime and optimistic cache

The browser connects to the same-origin `/api/realtime?workspaceId=<uuid>` using
`ws:` locally or `wss:` over HTTPS. The Next.js `/api` rewrite forwards upgrades
to the API; no separate public socket URL or credential is needed.

The API requires the configured `AUTH_URL` origin, a valid person session and
workspace membership before upgrading. It registers the socket, then rechecks
session and membership to cover revocation during the handshake. Expired or
revoked sessions and changed workspace membership close the affected sockets.
Client messages are rejected; writes continue through validated REST or MCP
adapters and the same core permissions.

Core owns the PostgreSQL `LISTEN taff_changes` connection. Transactional audit
triggers emit only the strict shared `ChangeEvent` routing metadata: activity,
workspace, resource, action, actor and affected user identifiers. Payloads contain
no task contents, session values or token secrets. Workspace events reach only
that workspace's sockets; profile events reach only the affected user. Auth
maintenance events are suppressed so session refresh does not cause refetch loops.

The web client invalidates task, run, review, Inbox, agent, token, call-log,
membership and profile caches on valid matching events and on socket reopening.
Matching changes received while the handshake is being reauthorized are latched
until authorization completes. Database listener reconnects close sockets so
browsers refetch after any missed notifications. Socket retries use bounded
backoff and resume on focus or an online event. Workspace changes and logout
dispose the previous connection.

Optimistic writes cancel reads and snapshot the existing TanStack cache before
patching visible state. Rejected writes restore the snapshot; settled writes
reconcile with core. Incoming invalidations wait for pending writes so they
cannot replace rollback snapshots. Socket closure immediately revalidates the
session even while a write is pending. Account or workspace-access changes clear
protected caches before rendering and invalidate old mutation snapshots, so late
responses cannot populate another account's cache. Credentials, new authentication and raw
agent tokens remain server-authorized; optimistic state never fabricates them.

This is cache reconciliation, without offline write queues or durable event
replay. PostgreSQL notifications may be lost during a disconnection; refetching
on reconnect obtains current authorized state. The first open of a page
only marks the families stale instead of refetching them: the initial reads
are in flight or seconds old at that moment, and a change inside that
handshake window is picked up on the next focus, mount or event. Every later
open follows a disconnect and refetches.
