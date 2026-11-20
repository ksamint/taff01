# 161 · OMV map: readable header and flow as a swimlane

- Base `d7fabfa` on `claude/trusting-bell-ylwvn9` (milestone 160).
- Owner command, 2026-11-20: explain "M; o, q, c, r", and make Flow visual
  and easy to read.
- Working: the header now says in words what produced the view (looking
  from, asking, seen by, drawn as, from model), with a closed "How to read
  this page" section that explains M, o, q, c and r in one line each.
- Working: each of the 25 flow steps names who acts (`lane`: Person, Agent
  or System) in `scripts/architecture/focus.ts`. The Flow view draws each
  flow as a swimlane: one row per actor, steps numbered left to right, arrows
  from each step to the next, the module under each title. On a phone the
  lanes become columns and the steps run top to bottom.
- Validation in the cloud session: Biome clean; scripts type check clean;
  script unit tests passed; five swimlanes, 25 steps and 20 arrows rendered
  in Chromium at 1440 px and 400 px with no page error and no sideways
  scroll of the page.
- Not run: the full `pnpm check` (no Docker daemon in the session).
- Missing: branches and loops in a flow (a review that sends work back is
  drawn as a straight path); the other gaps of milestone 160 are unchanged.
- Research for the owner, not yet built: structure practices from Linear,
  Asana and Shape Up (initiatives, project milestones, cycles, multi-homing,
  health updates, hill charts). Open decision: which to adopt.
