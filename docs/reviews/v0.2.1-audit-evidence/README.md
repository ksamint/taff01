# v0.2.1 audit evidence

The report describes tagged source `1200f704fd8bb10af890c6761618291f8370e925`.
Corrective live-release files describe accepted source `8d335ff7a9513bf35bcaf6b99c7f54935a0446e4`.
These files contain sanitized numeric/source evidence, not production records,
credentials, cookies, raw browser traces or private deployment journals.

## Route measurements

`route-performance.json` contains the final 12 controlled local measurements.
`measure-routes.mts` reproduces the route probes against an isolated local
production build. It refuses non-localhost URLs. It logs into the seeded demo
account and changes **only that disposable local profile**, including locale and
timezone; never point it at production. Run with the project's pinned Node 24,
installed dependencies and local environment injection, as other release scripts:

1. Create and migrate a separate local database; seed it with `SEED_DATE` matching
   the browser's current civil date. Use the existing project seed command and a
   local generated demo password. Keep the environment file ignored and 0600.
2. Build and start the audited source with the existing release-stack script and
   that environment. Stop competing local performance/a11y workloads.
3. Run the TypeScript driver with `tsx --env-file=<private-local-env>`, supplying
   `AUTH_URL=http://localhost:<web-port>`, `DEMO_EMAIL`, `DEMO_PASSWORD` and
   `SEED_DATE` through the environment. The file uses prototype fixture IDs from
   the same repository.

LCP uses three fresh contexts per route/locale: 393×850, DPR 2.75, touch/mobile,
1.6 Mbps down, 750 Kbps up, 150 ms RTT and 4× CPU slowdown. Lighthouse uses its
mobile preset and devtools throttling; cache, IndexedDB, service workers and
CacheStorage are cleared before each run. Auth, route markers, locale and actual
Calendar fixture events are checked. LCP samples are not Lighthouse's simulated
LCP. Scores are performance/accessibility/best-practices. Raw sanitized local
Lighthouse reports remain in the operator evidence directory; their hashes are
in `route-lighthouse-hashes.json`.

Exploratory runs with a different Node version, concurrent load, stale seed date
or an incorrect selector were discarded. The final run used Node v24.19.0 and
seed date 2026-10-15. These measurements characterize the deployed source under
controlled local conditions; they are not geographic production latency.

## Failure inventory

Counts describe observed failed workflow runs or live attempts. They do not
invent a total number of test opportunities. Cancelled runs, deliberate failing
font experiments, deterministic defects and unresolved intermittent failures are
kept distinct. Follow-up repair CI failures are recorded separately in the
report so they cannot change the baseline history silently.

## Accepted corrective release

`live-v022-acceptance.json` records exact source/tag, green CI, fresh 146-case
acceptance, supplemental cleanup and independent unlock/health proof hashes.
`live-v022-route-performance.json` contains twelve real public-origin route/locale
measurements from normal deployment Step 4, with one project, three tasks and one
Calendar occurrence. It retains numeric results and operator hashes, excluding
business identifiers and private paths. This is distinct from the controlled
local v0.2.1 fixture above. Original profile, supported fixture state, sessions
and owned browser profiles were cleaned up and verified.
`live-v022-health.json` records the final read-only production health, migration/
table/auditCrm checks, backup catalog, retention inventory and defined logical
verification residual scope. Read its attribution/physical-size limitations.
