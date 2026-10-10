# ADR 0010 — Username login and trusted administration

Username login uses the installed Better Auth username plugin, with a nullable
unique lowercase username. Names accept 2–30 ASCII letters, digits, underscores
and dots. Public registration optionally accepts a username and still requires
an eight-character password. Sign-in accepts six characters so an explicitly
configured private account can authenticate without weakening registration.
The existing email and SMS identities remain separate.

System administrators have a private `users.system_admin` flag. Public signup
cannot supply that flag or a user ID. Database triggers create actual person
memberships with the admin role in every existing and future workspace,
including personal workspaces. Organization administrators cannot remove or
demote these memberships. Core continues to use `can()` with real member IDs;
there is no permission bypass for agents or fabricated members.

`core.provisionAdministration` is a trusted deployment operation with no HTTP
or MCP route. It accepts organization names, canonical phone identities and
one scoped organization administrator through validated runtime input. A
serialized transaction records audit events and creates the organizations,
memberships, user and hashed credential atomically. The administrator ID has
private deterministic provenance; a conflicting username or changed password
fails without reassigning an account or resetting credentials. Repeating an
identical request is idempotent. Existing phone identities retain their data;
new phone identities remain unverified until SMS verification.

The bundled `administration.mjs` CLI reads bounded JSON from stdin and existing
deployment secrets from environment. It prints IDs and organization names on
success, generic error codes on failure. Personal phone numbers and passwords
are never embedded in source, migration data, command arguments or reports.
