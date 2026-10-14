# M19 — Cleanup, accessibility, i18n, release

Plan §6.1 M19 (`docs/frontend-v2-plan.md`). M19 shipped in four pull requests:
- #21, cleanup;
- #22, fonts and i18n;
- #23, accessibility and locale captures;
- the release pull request (`m19-release`), with the changelog, README,
  version and this report.

## What works

### Accessibility and locale captures

- **Audit script now in the repo.** The M9 288-context audit ran from a
  private harness; only its summary proof was committed. The audit is now
  `scripts/ui/a11y-audit.mjs` and runs against an isolated seeded app:
  `DEMO_PASSWORD=… node --env-file=.env scripts/ui/a11y-audit.mjs <out>`.
  Its measurements match the M9 proof:
  - text contrast against the composited background (4.5:1, or 3:1 for
    large text; disabled controls are exempt under WCAG 1.4.3);
  - text below 12 px;
  - effective phone targets of at least 44 px. Associated labels and
    stretched `::before`/`::after` hit areas count toward the target. Links
    inside a sentence are exempt under WCAG 2.5.8;
  - accessible names from Chromium's accessibility tree;
  - a complete keyboard Tab cycle, where every stop has a visible focus
    ring (outline or box-shadow on the control, its pseudo-element or a
    `:focus-within` wrapper);
  - `html[lang]` per locale.

  Unrendered content, such as a closed `<details>` or a 1 px `sr-only`
  node, is not measured. No rule or element is excluded.
- **Every v2 route in plan §7 is covered.** There are 28 phone and 30
  desktop route states:
  - signed-out home, Today and Calendar;
  - Projects, plus the board, list, timeline, stakeholders, relations and
    mind views;
  - Companies and company detail, Contacts and contact detail;
  - the task page, the task sheet and panel, and Review;
  - Inbox (`/inbox` on phone, `/me?tab=inbox` on desktop) and the AI brief
    (`/brief` on phone, `/me?tab=brief` on desktop);
  - Me, plus desktop `?tab=agents` and `?tab=settings`;
  - agent profile, MCP, notifications and `/orgs`;
  - Digests and digest detail;
  - the quick-add and search dialogs.

  Each state runs in 3 locales × light/dark, which gives **348 contexts**
  (up from 288).
- **Result after fixes.** All 348 contexts render. They had 9,402 focus
  stops, 11,112 interactive elements and 25,254 text elements. The audit
  found zero of each of these: contrast failures, undersized phone targets,
  text below 12 px, missing names, missing focus rings, incomplete tab
  cycles and `lang` mismatches. 216 text nodes sit on gradient or image
  backgrounds and were left to manual review. The sanitized proof, with the
  before and after counts, is
  [`m19-accessibility-audit.json`](../ui/review-2026-10-14/m19-accessibility-audit.json).
- **Defects fixed** (before: 165 contrast failures, 184 small phone targets
  and 12 missing focus rings; after: 0):
  - The phone tab badge (`inbox-badge`), the desktop sidebar badge and Me's
    `.me-count` used white 12 px text on gold, which is 3.24:1. A new token,
    `--text-on-accent`, sets deep blue in both themes (5.5:1); dark already
    used it. See `tokens.css:85-86,172`, `shell.css:16,154` and
    `me.css:244`.
  - Timeline row buttons were 43 px tall, because the row's 1 px border sat
    inside the 44 px row. The divider is now an inset shadow
    (`timeline.css:237-242`).
  - The mind map's source links were 24–42 px tall. They now have
    `min-height: 44px` (`mind.css:485`).
  - The English "List" view tab was 42 px wide. Project view tabs now have
    `min-width: 44px` (`projects.css:119-121`).
  - The contact detail phone and email links were 19 px tall. They are now
    44 px inline-flex targets (`crm.css:528-530`).
  - The brief's ask send button was 40 px and is now 44 px
    (`brief.css:95-96`).
  - The brief's ask input showed only a 1 px border-colour change on focus.
    The field now draws the standard focus ring through
    `:has(input:focus-visible)` (`brief.css:69-73`).
- **Keyboard-only flow.** `e2e/accessibility.spec.ts` passes 3/3 (en, zh-CN
  and zh-HK) on the production build, both before and after the fixes. The
  flow creates, assigns, opens and approves a task with real MCP evidence,
  using only Tab, Enter, Space, End and Escape, and checks focus restore and
  the rings.
- **Locale route captures.** `pnpm ui:app-shots` (`scripts/ui/app-shots.mjs`)
  had v1 assumptions, which are now updated for v2:
  - the sidebar has 5 primary links;
  - desktop quick add opens from `desktop-new-task`;
  - desktop organization, notifications and team states use
    `/me?tab=settings`, `/me/notifications` and `/orgs#team`.

  The script also adds the ten v2 states: five project views, the
  companies and contacts lists and details, and the brief. It captured
  **186** screens: 31 states × 3 locales × phone and desktop, up from 126.
  Every route rendered in every locale. The PNG sizes match their viewports.
  The captures and their SHA-256 manifest are in
  [`m19-locales-2026-10-14`](../ui/screenshots/m19-locales-2026-10-14/README.md).
- `scripts/test-id-contract.mts` now also scans `scripts/ui/a11y-audit.mjs`.
  `e2e/support/test-id-contract.md` has been regenerated.

### Cleanup (PR #21)

- **Visual suite renamed.** `e2e/ui-parity.spec.ts` is now
  `e2e/ui-v2.spec.ts`. Its 86 baselines moved byte for byte to
  `e2e/__screenshots__/ui-v2.spec.ts/`. Both Playwright configs,
  `visual-baselines.yml` and the test-id contract are updated to match.
- **No screens dropped.** The plan's "86 v1 baselines" predates M13. D11
  replaced baselines screen by screen through M13–M18, so all 16 screens
  are v2 routes, and the screen list and PNG count stay the same.
- **Dead CSS removed.** 317 lines of v1 rules whose classes appear nowhere
  else in the repo were removed from `base.css`, `task-detail.css` and
  `today.css`. An import-graph check found no unreachable TS/TSX module.
  `/digests` is unchanged.

### Fonts and i18n (PR #22)

- **Noto Sans TC subsets.**
  - **Regenerated** with the procedure in `apps/web/public/fonts/README.md`
    from these sources: the locale strings, hard-coded CJK in the app, the
    seed content and Intl date text. With the old character set, the
    procedure reproduces the old files byte for byte.
  - **Size:** 714 → 975 characters, and 219,496 → 295,616 bytes across the
    two files.
  - **Faces and ranges:** there are still four faces, so `prepare-fonts.ts`
    is unchanged. The `unicode-range` values match each file's character
    map exactly.
  - **Visual baselines:** 69 of 86 were recaptured on CI.
- **Traditional-character lint.** `apps/web/src/lib/zh-hk-characters.test.ts`
  holds the plan §2.4 item 13 list in one constant. The test fails on any
  of those characters or words in a zh-HK string and names the key,
  character and correction. A self-test proves it catches every entry and
  allows legitimate words such as 注意, 恢復 and 批准. No current string
  violated it.
- **Key parity.** The new test also requires matching `_one` and `_other`
  plural pairs and identical `{{placeholders}}` in every string across en,
  zh-CN and zh-HK. The existing nested-key parity test still passes.

### Visual capture readiness (PR #23)

The Me screen had no readiness check in `ui-v2.spec.ts`. One CI capture saved
`desktop-zh-HK/me.png` with the main pane still blank, and the next comparison
failed by 33,948 px.
- **Fix:** desktop Me now waits for every inbox item and the task detail
  heading; phone Me waits for its inbox and brief rows. These are added
  assertions; none was removed or loosened.
- **M18 note:** the same race most likely caused the M18 `desktop-en/me.png`
  mismatch, which was put down to font metrics at the time.

### Release

- `CHANGELOG.md` covers v0.2.0 and M11–M19. The README includes the v2
  summary and capture commands. Workspace packages and the MCP server
  version are `0.2.0`.
- **v0.2.0 is deployed and accepted** at [taff.apuch.cn](https://taff.apuch.cn),
  source `191243d25ea4f72116aadf2a9f7fec844a0ffa6e`. The annotated
  [v0.2.0 tag](https://github.com/ksamint/taff01/tree/v0.2.0) points to that
  exact source. The final checkpoint, backups, public acceptance, MCP
  server-version checks and free-lock evidence are in `docs/deploy.md`.
- M19a `9577c8c` was the preceding accepted upgrade. The deployment watcher
  stops after this final release, as the goal requires.

## Missing

### Accessibility and locale captures

- **Locale captures are light theme only.** Dark theme is covered by the
  audit, not by captures.
- **Brief date in captures.** The brief's date line uses the server clock,
  so captures show the capture day rather than the frozen 2026-10-08.
- **Manual review of gradient text.** The 216 text nodes on gradient or
  image backgrounds (calendar hatching, for example) still need a manual
  review. M9 measured the calendar stripes at a minimum of 8.44:1.

### Other parts

- **Fonts.** The TC font has no glyphs for 173 Simplified characters used in
  zh-CN strings and seed content, so those still use the system font, as
  before.
- **Monospace.** The `⌘K` hint uses the system monospace stack, so it can
  render differently from one machine to the next.
- **Relations view.** In English, the view now downloads the 225 KB
  remaining font file for `↔`.

## Open decisions

### Accessibility and locale captures

- `--text-on-accent` uses deep blue on gold in light theme too, where the
  prototype used white. White on `#a88b52` cannot reach 4.5:1. The other
  option is a darker badge gold (`--accent-text`, `#785f2a`, gives 5.8:1
  with white). This needs a design call if the prototype look is preferred.

### Other parts

None.

## Validation

### Accessibility and locale captures

The validation ran on an isolated stack: production build (`CI=1`), web on
port 4300, API on port 4301, databases `taff_a11y` and `taff_a11y_test`,
Valkey DB 9, seed date 2026-10-08.

| Check | Result |
| --- | --- |
| `scripts/ui/a11y-audit.mjs`, before fixes | 348 contexts; 165 contrast, 184 small targets, 12 missing focus rings; 0 names, 0 small text, 0 incomplete cycles |
| `scripts/ui/a11y-audit.mjs`, after fixes | 348 contexts; 0 failures in every category |
| `e2e/accessibility.spec.ts` (keyboard-only) | 3/3 before and after |
| `e2e/i18n.spec.ts` | 3/3 |
| `timeline`, `mind`, `crm`, `brief`, `me` specs (en) | 15/15 |
| `scripts/ui/app-shots.mjs` | 186 captures, 0 failures |
| `pnpm lint && pnpm typecheck` | pass |
| `scripts/test-id-contract.test.ts` | 3/3 |
| vitest `scripts` + `apps/web` | 30 files, 191 tests pass |

### Other parts

Under the 2026-10-14 working rules, contributors run only the fast checks
locally, and CI runs the full suite on every pull request and on `main`.

| Check | Result |
| --- | --- |
| PR #21: lint, typecheck, `pnpm test` (873), build | pass locally; CI [38565883593](https://github.com/ksamint/taff01/actions/runs/38565883593) green |
| PR #22: lint, typecheck, licence, `pnpm test` (877), build, `perf:budget` (Today 194,431 B / 204,800 B) | pass locally; CI [38569973363](https://github.com/ksamint/taff01/actions/runs/38569973363) green |
| PR #23 CI (LCP guard, gated Lighthouse, visual suite, e2e, MCP smoke) | [38576480541](https://github.com/ksamint/taff01/actions/runs/38576480541) green |
| `main` CI on `9577c8c` (M19a candidate) | [38572631759](https://github.com/ksamint/taff01/actions/runs/38572631759) green |
