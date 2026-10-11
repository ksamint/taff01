# ADR 0014: Neo4j relationship projection

Status: accepted by the explicit user request of 2026-10-11.

PostgreSQL on ins-nx2vm7pc remains the authoritative Taff database. The user requested relationships and visualization using Neo4j on ins-aj5kmjag, followed by production deployment. The official server-side neo4j-driver 6.2.0 is Apache-2.0; no browser dependency or new ORM is added. The existing Neo4j Community service stays in place.

## Decision

Project existing projects, tasks and person/agent members into TaffWorkspace/TaffEntity nodes. Typed outgoing task edges identify its project, parent task, owner and worker. Worker startup, coalesced PostgreSQL change notifications, reconnect and a 60-second reconciliation sweep rebuild the projection. Replacements are atomic per workspace, with a PostgreSQL advisory lock and a Neo4j marker lock. Removed workspaces and over-limit projections are cleaned only within Taff labels. Other applications’ nodes, relations and constraints are retained.

The authenticated GET /api/graph endpoint applies the same workspace-read permission as existing SQL views. It compares the current PostgreSQL snapshot fingerprint against both the Neo4j checkpoint and the actual returned graph. Any mismatch withholds graph contents until synchronized, including deletions and changed assignments. Neo4j failure does not redirect or prevent business writes to PostgreSQL. Partial connection configuration fails startup with a redacted error; entirely unset credentials disable the optional feature.

The response is bounded at 500 nodes and 2,000 relationships. Larger workspaces receive an explicit too_large result, never a silently truncated graph. /relations provides search, focused relationship diagrams, paging and a full-label textual relationship list, with keyboard access and all three locales. Existing prototype screens retain their layout.

Production connects with verified TLS to bolt+s://neo4j01.internal.apuch.art:7687, privately mapped to 10.206.103.5. The existing PostgreSQL CA also signs the Neo4j certificate, so the established read-only CA mount is reused. Credentials remain in the private production environment and never reach the browser. Neo4j Community has no label-level privilege isolation: Taff’s isolation is enforced in server-side queries, labels, workspace keys and PostgreSQL authorization; this is not a separate physical database or Enterprise RBAC guarantee.

## Consequences

The projection can be rebuilt entirely from PostgreSQL. It contains names/titles/status and existing relationships, without emails, passwords, tokens or task bodies. Graph reads may briefly report stale during reconciliation or unavailable during an outage. A future large-workspace graph would need scoped queries rather than raising the global bound. No arbitrary Cypher API or graph-only business edits are introduced.
