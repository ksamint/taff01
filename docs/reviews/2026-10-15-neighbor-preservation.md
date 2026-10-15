# Shared-host neighbour preservation

The v0.2.1-a strict probe treated every shared-host container replacement,
restart or health transition as Taff damage. Four legitimate TableAI A/B rollout
changes therefore became a failed platform check. The original evidence remains
unchanged; the correction applies to new deployments.

The new `scripts/deploy/neighbor_preservation.py` compares sanitized snapshots,
including container identity, name, project/service, immutable image, reference,
start time, running state and health. A Taff mutation journal match fails.
Unexplained drift blocks acceptance until attributed. Only an independently
verified publisher receipt binding the exact before/after effects is
informational. No project-name allowlist or blanket health exemption exists.
New/deleted containers are included. A later change invalidates the receipt.

For each independent change the operator records `project`, `before`, `after`,
absolute publisher `source`, its `sha256` and `verifiedAt` in the private deployment
job's `independent-rollouts.json`. `before`/`after` have the comparator's exact
identity fields (or null for an addition/removal). Verify the publisher's phase
journal, immutable image and slot/result against Docker times before writing
this receipt. `load_receipts` rehashes the original publisher source on every
check. Docker labels or coincident timestamps alone do not establish causality.
The publisher scopes Compose mutations to project `taff`; an unexpected mutation
outside that scope must be recorded in `taff_effects` and fails even with a
matching independent receipt. Runtime receipts and deployment journals stay
private; do not store container environments.

The new-release controller and independent unlock probe are rendered by the
existing private `stage-release.py`, which stages this versioned comparator and
writes the full `neighbor-preservation.json` report. They use the same comparator
and require `status=passed`. The checkpoint writer includes informational
container names, times and publisher evidence. Route hash, private env mode and
values, PostgreSQL start/role/TLS, Caddy and Valkey remain separate strict checks.

## Independently verified v0.2.1-a TableAI rollout

Read-only inspection on 2026-10-15 found TableAI publisher evidence in
`/srv/tiansight/runtime/deployments/37a0eadeb1fe/`. `result.json` records success,
previous slot `a`, active slot `b`, release `1.0.0-37a0eadeb1fe-7d34bfbc6a22`,
image digest `869f5219fbd203a59b516b1fea5e6f1f3df04af4991bc06aa3f755521743c819`,
and finish `2026-10-15T03:01:35.522929Z`.

| Container | Independently recorded Docker effect (UTC) |
| --- | --- |
| `tableai-can01-converter-b` | Replacement started 03:00:36.954327657 |
| `tableai-can01-app-b` | Replacement started 03:00:42.319449568 |
| `tableai-can01-app-a` | Old active slot stopped 03:01:31.119358106 |
| `tableai-can01-converter-a` | Old active slot stopped 03:01:31.276977226 |

The independent phase journal brackets both B starts within
`idle_read_only_warmup` (03:00:36.788397–03:00:49.243892Z), and both A stops within
`accept_activate_finalize` (03:01:30.380851–03:01:31.401047Z). This establishes
attribution beyond container project labels. Journal SHA-256:
`16c8dc9321e8b325ad127f5bc11c42a73edcc95c5663ee4c1dca14280744b8a1`;
result SHA-256:
`c64cee1f166c61ee97c0394f3486872a58f181cb16a4e08bc8fc42a23338026d`.

A subsequent independent TableAI deployment directory `775736cb8496` appeared
around 03:17Z during inspection. Its effects need a fresh baseline/receipt;
the earlier receipt cannot exempt them. No TableAI service was changed by this
investigation. Historical failed probe results have not been rewritten.

Regression coverage exercises unchanged neighbours, replacement attribution,
receipt invalidation by later health drift, Taff attribution overriding an
independent receipt, active-slot stop, additions/removals and rejection of
project-wide or Taff exemptions. Run `python3 -m unittest discover -s scripts/deploy`
or the normal Vitest suite (which runs the same checks).
