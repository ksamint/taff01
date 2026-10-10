# M10 — UI parity with the approved prototype

Source: `docs/agent-goal-ui-parity.md`, before the remaining M9 items.
Implementation branch: `codex/ui-parity`, based on `main` at `6d78415`.

## Starting review

Read `docs/ui/review-2026-10-10/README.md` and personally inspected all 14
PNG images before changing code. The reviewed app is `55b315b`; the review
and parity objective were added to main in `84eb670`; `6d78415` adds the
source-port requirement and markup line map.

The implementation source is the prototype's markup and inline styles, not
its screenshots. Each block is ported to TSX, its styles lifted into CSS
classes using the existing tokens, and its bindings replaced by the current
app's queries and mutation handlers. Prototype icons map to Lucide; its
Button, Switch and Badge map to the existing `components/ui` primitives,
extending a primitive only when a used variant is missing. Captures check
the result. The existing accessibility floor takes precedence over the
prototype's smaller targets and 11 px labels.

| Screen | Observed difference to address |
| --- | --- |
| Shell | Global top bar and large heading consume the phone's first third; the prototype has compact screen headers, a square FAB, toast, and desktop organization/search/agent sidebar. |
| Today | Tall run cards and inline creation replace the prototype's timed schedule, agent block, now-line, and compact due rows. |
| Projects | Project/filter forms and status selectors dominate the board; reference cards put the ID, due date, title, parent and member chips in a compact hierarchy. Desktop lacks the selected-task panel. |
| Task detail | Full-page title/description/date forms replace the bottom sheet's field rows and inline deliverable review. |
| Inbox | Tall grouped cards omit agent identity, excerpt and inline approval; the reference has dense rows, unread dots, status chips and a desktop review panel. |
| Calendar | Extra route heading and header controls push the grid down; the reference uses a compact month/segmented header, hint, day dots, unscheduled chips and bordered blocks. |
| Me | Account/workspace forms and separated sections replace the avatar, role/team line, chevron rows and segmented preferences. |
| Type and density | 48 px route titles and generous form spacing must follow the prototype's 28 px titles, 15 px card titles and 12 px metadata. |

## Acceptance ledger

A screen remains pending until its real seeded app capture is shown beside
its matching reference, the committed visual baseline passes, and existing
behavioral flows remain green. Reference captures alone do not approve the
app. No production database will be seeded for this work.

| Step | State | Evidence |
| --- | --- | --- |
| 0 — offline prototype and capture tooling | Accepted locally; strict checks before push pending | 38 native zh/en reference captures; independent full navigation rerun passed with zero external requests or browser errors. [Matrix and provenance](../ui/reference/README.md). |
| 1 — shell | Visuals accepted at `dfcbefb`; committed-baseline and behavioral gates pending | Six native element captures personally inspected by the root agent; reference/app comparisons below. Phone tabs/FAB from lines 376–410, desktop sidebar from 940–953; existing session/cache guards retained. |
| 2 — Today and Northwind seed | Phone accepted at `e1c2d1a`, corrected desktop at `e5165f9`; behavioral gates pending | Four native captures inspected; independent comparison passed. Source 47–114, existing real schedule/tasks/run bindings. |
| 3 — Projects | Visuals accepted at `e5165f9`; behavioral gates pending | Eight production board/list captures, source 223–279/935–1045; side-by-side evidence below. |
| 4 — task detail and review | Visuals accepted at `e5165f9`; behavioral gates pending | Four task and eight review production captures; source 791–934/1034–1214 and sticky phone toolbar. |
| 5 — Inbox | Visuals accepted at `e5165f9`; behavioral gates pending | Four production captures, compact inactive desktop rows and focus-visible 44 px actions; source 280–322/1010–1034. |
| 6 — Calendar | Visuals accepted at `a93ca59`; behavioral gates pending | Twelve production day/week/month captures, source 115–222; exact day hatch and inverse month date fill. |
| 7 — Me | Visuals accepted at `e5165f9`; behavioral gates pending | Four production captures, source 323–375; real identity, members and preferences. |
| 8 — type, density and dark theme | Visuals accepted at `e5165f9`; behavioral gates pending | Eight production light/dark captures; actual source scale, existing tokens, 12 px/44 px floor. |

Before each push: lint, typecheck, licence gate, unit tests, web build,
server build, bundle budget, Playwright and MCP smoke. Final performance
acceptance also includes Lighthouse and three LCP runs in each locale.

## Step 0 evidence

React 18.3.1 and the prototype fonts are local, with MIT/OFL licences and
source hashes. The self-serving runner captures 22 phone and 16 supported
desktop views, verifies native dimensions, font loading and initial task
state, and rejects external requests and browser errors. The root agent
independently walked every view in both languages using this runner, then
inspected the resulting references. English and Chinese both retain NW-138
working at 2/4; the simulation is frozen only by the capture harness.

The prototype does not define desktop Today, Calendar, Me, MCP or agent
profile layouts. Those gaps are listed explicitly in the reference matrix.
Phone references retain synthetic OS chrome; comparisons account for that
chrome without adding a fake status bar to the app.

## Shell candidate

The signed-in global header is removed. Quick Add moves to the 52 px dark
square FAB, language and sign-out to Me, and search to compact screen
headers and the desktop sidebar. The sidebar follows the source's 208 px
width, organization menu, search/⌘K control, two primary links and agent
rows; bottom utility links retain desktop access to Today, Calendar and Me.
The standing 44 px target floor enlarges the prototype's 32 px sidebar
controls. Counts and agent dots use actual API data. Foreground alerts keep
notification preferences and device delivery, with the source's dark bottom
toast and View action. Other screen ports remain pending.

The real Northwind fixture prerequisite is included: 12 Checkout tasks,
five workspace members, three agents, real reviews/blockers/inbox and
recurring scheduled meeting tasks. Quartz and Personal are separate demo
organizations. Deterministic identities let repeat seeds preserve edits,
passwords, approvals, permissions and calendar changes. Canonical untouched
fixture fields translate in all three locales; edited content stays verbatim.
`SEED_DATE` anchors isolated visual data to October 8; normal seeding uses
the current day in the existing demo account's time zone. No production
database is seeded.

Current checks: six-package typecheck, licence gate and three seed unit
tests pass. PostgreSQL integration and browser assertions are pending: the
local PostgreSQL container accepts internal connections but the host driver
query timed out before assertions. The initial browser run was stopped
while waiting for API readiness, with its owned processes cleaned up.
Acceptance will use the prepared isolated Linux environment.

## Shell visual checkpoint — 2026-10-10

The root agent personally inspected all six `dfcbefb` app captures and
accepted the Shell visuals. The six accepted PNGs are copied unchanged to
`e2e/__screenshots__/ui-parity.spec.ts/`, using the visual configuration's
four project names. This is visual acceptance, not a claim that the nine
validation gates have passed: the committed-baseline check and behavioral
acceptance remain pending.

The implementation inputs remain the HTML blocks: phone FAB and tabs at
376–410, desktop sidebar at 940–953. These comparisons use only native
pixel crops of the corresponding reference captures, without scaling or
reconstructed pixels. The phone tab crop omits the 28 px synthetic OS home
area; the app does not add fake OS chrome. The 52 px FAB and 208 px desktop
sidebar are compared at their source dimensions. [Crop coordinates and
hashes](../ui/screenshots/ui-parity/shell/README.md) preserve provenance.

| Region / locale | Prototype reference crop | Accepted real app |
| --- | --- | --- |
| Phone tabs / English | ![Reference English phone tabs](../ui/screenshots/ui-parity/shell/phone-en-tabbar-reference.png) | ![App English phone tabs](../ui/screenshots/ui-parity/shell/phone-en-tabbar-app.png) |
| Phone tabs / Hong Kong Chinese | ![Reference Chinese phone tabs](../ui/screenshots/ui-parity/shell/phone-zh-HK-tabbar-reference.png) | ![App Hong Kong Chinese phone tabs](../ui/screenshots/ui-parity/shell/phone-zh-HK-tabbar-app.png) |
| Phone FAB / English | ![Reference English FAB](../ui/screenshots/ui-parity/shell/phone-en-fab-reference.png) | ![App English FAB](../ui/screenshots/ui-parity/shell/phone-en-fab-app.png) |
| Phone FAB / Hong Kong Chinese | ![Reference Chinese FAB](../ui/screenshots/ui-parity/shell/phone-zh-HK-fab-reference.png) | ![App Hong Kong Chinese FAB](../ui/screenshots/ui-parity/shell/phone-zh-HK-fab-app.png) |
| Desktop sidebar / English | ![Reference English sidebar](../ui/screenshots/ui-parity/shell/desktop-en-sidebar-reference.png) | ![App English sidebar](../ui/screenshots/ui-parity/shell/desktop-en-sidebar-app.png) |
| Desktop sidebar / Hong Kong Chinese | ![Reference Chinese sidebar](../ui/screenshots/ui-parity/shell/desktop-zh-HK-sidebar-reference.png) | ![App Hong Kong Chinese sidebar](../ui/screenshots/ui-parity/shell/desktop-zh-HK-sidebar-app.png) |

Documented differences preserve working behavior and the accessibility
floor: targets are at least 44 px and text at least 12 px, enlarging the
source's 32 px controls and 11 px labels. The real API returns four unread
Inbox items, while the prototype shows three; badges and agent status dots
retain actual data. Desktop utility links for Today, Calendar and Me retain
access to those existing routes below the source sidebar's primary links
and agents. The native Lucide icon mappings and these differences are part
of the accepted Shell capture, not screenshot substitutions.

CI now runs the explicit Shell visual check before behavioral flows, after
the existing isolated `db:seed` step and builds. Behavioral tests can edit
the fixture and repeat seeding intentionally preserves edits, so running
visuals first avoids depending on a destructive reset. The visual check
uses the committed baselines and does not update them in CI.

## Today visual checkpoint

The root agent inspected all four `e1c2d1a` captures after an independent
comparison passed. Production verification at `e5165f9` revealed that the
earlier desktop images had captured an empty Sidebar before it loaded. Root
inspected and intentionally replaced those two desktop images; all reported
differences are inside the formerly blank left 208 px. The main content has
zero reported differences under the unchanged comparison settings. Both phone
baselines pass unchanged. Fresh full comparisons remain required.
The source's date/header, timed blocks, dashed agent work,
gold now-line and compact due rows bind actual Northwind data. Actual meeting
durations, attendees, authenticated-user initials, unread count and paused work
remain truthful. No planned-step total or progress percentage is invented.
The [capture manifest](../ui/screenshots/ui-parity/today/manifest.json) records
source, reference and byte-identical app/baseline hashes. Behavioral and full
release checks remain pending. Synthetic prototype OS chrome is absent in the app.

| Locale | Prototype reference | Accepted real app |
| --- | --- | --- |
| Phone English | ![Today reference English](../ui/reference/phone-en-today.png) | ![Today app English](../ui/screenshots/ui-parity/today/phone-en-app.png) |
| Phone Hong Kong Chinese | ![Today reference Chinese](../ui/reference/phone-zh-today.png) | ![Today app Chinese](../ui/screenshots/ui-parity/today/phone-zh-HK-app.png) |

The prototype has no desktop Today view. These are responsive app evidence:

| Desktop English | Desktop Hong Kong Chinese |
| --- | --- |
| ![Today desktop English](../ui/screenshots/ui-parity/today/desktop-en-app.png) | ![Today desktop Chinese](../ui/screenshots/ui-parity/today/desktop-zh-HK-app.png) |

## Integrated source ports — candidate, acceptance pending

### Search visual checkpoint

The root agent inspected all four native `e1c2d1a` Search captures after
strict independent comparison passed. The source's phone full-screen search
and desktop palette bind the existing query, scope, filters and keyboard
handlers. Fresh-session recent history is empty; the real search supports
Tasks, Comments and Settings and its existing filters. Prototype-only event
or people searches and invented recent queries are not presented. Controls
retain the 44 px floor and visible focus. Full behavioral gates remain pending.
The [manifest](../ui/screenshots/ui-parity/search/manifest.json) records unchanged
app/baseline bytes and references. CI compares these approved baselines.

| View | Prototype reference | Accepted real app |
| --- | --- | --- |
| Phone English | ![Search reference](../ui/reference/phone-en-search.png) | ![Search app](../ui/screenshots/ui-parity/search/phone-en-app.png) |
| Phone Hong Kong Chinese | ![Search reference Chinese](../ui/reference/phone-zh-search.png) | ![Search app Chinese](../ui/screenshots/ui-parity/search/phone-zh-HK-app.png) |
| Desktop English | ![Search desktop reference](../ui/reference/desktop-en-search.png) | ![Search desktop app](../ui/screenshots/ui-parity/search/desktop-en-app.png) |
| Desktop Hong Kong Chinese | ![Search desktop reference Chinese](../ui/reference/desktop-zh-search.png) | ![Search desktop app Chinese](../ui/screenshots/ui-parity/search/desktop-zh-HK-app.png) |

The source ports also include Notifications (613–635), the house Switch,
and Quick Add (794–812). Preference persistence, parsing, assignment,
creation and their error paths retain the existing handlers. Twelve further
offline phone references cover Calendar week/month, Projects list,
Notifications, Team and Quick Add; the root agent inspected each.

At `8489383`, Today generated four real seeded captures and passed an
independent comparison without updates. These are diagnostic captures, not
approved Today baselines: inspection prompted a compact worker-chip styling
correction. The font harness now loads the four actual stylesheet faces before
capture. It preserves their families, sources, weights and Unicode ranges;
product `font-display: optional` and cold performance measurements are unchanged.
Four Shell tab/sidebar baselines were explicitly reinspected and replaced to
correct the earlier fallback-font renders, with provenance in the Shell manifest.

Visual navigation now selects the real Project task cards for the phone sheet
and desktop detail pane. Desktop review opens the real Inbox control, then
restores the isolated recipient's read state in a `finally` block. Screens wait
for their dependent data before capture. These runner changes require the next
sealed browser run; no production deployment or database changes are included.

Today, Projects, task detail and review, Inbox, Calendar and Me now have TSX
and token CSS ports from the line map. The shared shell persists across routes;
Next intercepted task routes preserve the preceding phone screen. Desktop
Projects and Inbox bind the existing task editor in the source's detail pane.
Source Search, agent profile, MCP and Team blocks are also ported. Existing
permissions, version checks, form drafts, optimistic rollback, recurrence,
notifications, token reveal-once and cache identity guards remain in their
original handlers. House Button, Input, Label, SheetDialog and the shared
Lucide StatusGlyph map the prototype primitives.

Review found and repaired nested-dialog Escape propagation, cross-workspace
task member/run/comment scoping, and account-specific timezone initialization.
Schedule controls sit outside the metadata form; an embedded approval failure
keeps checks, item decisions and comment drafts. Existing 105 browser cases
retain their behavioral assertions; twelve regression cases cover Me preferences,
schedule-save isolation, approval rollback and cross-workspace nested editing.
The expanded suite has 117 cases; integrated browser execution is pending.

A local production build exposed Next 16 parallel-route validation: an explicit
implicit-slot fallback now preserves 404 behavior while the modal slot clears
on navigation. The build succeeds. A preliminary integrated Today measurement
is 196,993 bytes gzipped, below 204,800; this measurement precedes the last
auxiliary CSS imports and is not final acceptance. Full typecheck and lint pass.

The immutable Shell candidate `dfcbefb` completed seven required checks and
all three Lighthouse/LCP locale runs, but failed Playwright (95 passed,
10 failed); MCP smoke was not reached. Failures concern the held run navigation,
profile rollback after route changes, consumed invitation URL restoration and
one MCP attachment capability response. The integrated candidate addresses the route
lifetime and selector issues; it must pass the full runner before any push.
The failing candidate's evidence is retained and its disposable infrastructure
removed. Production and the previously accepted validation environment remain
unchanged.

Gaps reflect real APIs: runs report events but no planned-step total, so no
percentage or pending steps are fabricated. Agent client/skills/health and MCP
connection health are absent. Search supports tasks, comments and settings;
it has no member/event search. The prototype has no desktop-specific Today,
Calendar, Me, agent profile or MCP layout. These supported responsive screens
need captures, baselines and side-by-side acceptance before being marked done.

The `786dbfb` diagnostic capture pass exposed shared house styles overriding
unlayered screen ports: phone Projects retained desktop controls, Search lost
its grid, and task fields lost source styling. The original Base declarations
are now moved byte-for-byte to a native cascade layer beneath the screen CSS.
Projects uses the existing task toolbar to close its pane; compact card/list
spacing and readable disabled fields preserve their handlers and 44 px targets.
Inbox waits for its task pane and keeps action controls in the source row.

Calendar capture dates now freeze native Temporal alongside Playwright Date:
Chromium's native Temporal clock otherwise selected the real day without the
seed's events. The helper asserts the frozen instant. Task-detail/review
diagnostic renders wrote all four images but collided during trace teardown;
per-screen output directories and an exclusive, bounded validation lock prevent
shared artifacts and overlapping browser runs. These diagnostics are retained,
not accepted baselines. Fresh comparisons and all nine required checks remain
pending for the sealed revision.

The sealed `8c5a40b` run failed performance acceptance: Today JavaScript was
197,419 bytes gzipped, but Lighthouse performance was 96 / 78 / 78 and the
three-run LCP medians were 2,208 / 2,536 / 2,524 ms (en / zh-CN / zh-HK).
The strict runner stopped before Playwright and MCP smoke; the 117 behavior
cases were not executed. Its terminal evidence is retained and its owned
disposable resources are removed. Thresholds and the 20-task fixture stay fixed.

That revision's diagnostic captures and independent comparisons succeeded for
Shell, Today, Projects, task detail, review, Inbox, Me, type, Search, agent,
MCP, Team, Notifications and Quick Add. Calendar exposed an Intl prototype
incompatibility between Playwright's clock and the existing Temporal polyfill;
the capture helper now preserves the native formatter descriptors. Organization
capture did not start while the preceding bounded browser lock was held.
Neither failure is recorded as a visual pass.

Inspection requires further source refinements before accepting these baselines:
minimum-content card overflow and phone list footer overlap, the translated
parent link, review content immediately after the task description with the real
actions in the footer, desktop Search height and Quick Add positioning, and the
native Team directory context. An additional review capture scrolls to the real
deliverable. Two offline desktop Quick Add references now complement the twelve
extra phone references; all fourteen have zero external requests and browser
errors. Fresh captures, side-by-side approval and the complete unchanged runner
remain required before any UI push.

The cold-page waterfall identifies another source of delay: the desktop
Sidebar's default lazy wrapper has no local Suspense boundary. Mounting it
behind CSS on a phone suspended the containing shell after fresh identity
confirmation. It now mounts at the existing desktop breakpoint and has its
own loading boundary. A real held-chunk/resizing regression joins the suite
(120 locale cases total); session confirmation and provisional-cache purging
are unchanged. Generic Today labels and every localized month/weekday/date now
use the common Noto subset. The disjoint font coverage remains exactly 714
mappings with unchanged outlines, metrics and axes at six weights. Neither
change is a performance pass until the unchanged cold-browser gates run.

The `fb27a5a` diagnostic candidate passed independent Projects board/list
comparisons in all four configurations. Calendar rendered all twelve day,
week and month captures; the Chinese phone month comparison failed because
the SDK retained a time-grid scroll offset, clipping the month headings.
The shared engine now resets month scrolling only after its native month
DOM mounts. The existing phone touch/month flow covers switching from a
scrolled week, an unclipped first row and the subsequent real event move.
Month chips also follow source lines 210–218: title-only text, square date
labels, two-pixel gaps and compact padding. Their native interactive elements
retain the required 44 px size.

Shell comparison found small Chinese glyph raster differences after the
common-font expansion. Only the new common font's `prep` raster-control
table is removed to retain the earlier subset's controls; mappings, outlines,
metrics, axes and layout tables stay unchanged. The exact reproducible asset
and hashes are recorded in `apps/web/public/fonts/README.md`. Fresh strict
pixel comparisons and the complete runner remain pending. The diagnostic
candidate is superseded without starting gates; it is not a validation pass.

At `f3c4f5b`, Calendar generated twelve native captures and passed an independent
comparison in all four configurations. Shell's raster repair reduced the
Chinese differences to 14 phone and eight desktop text-antialias pixels.
The root agent inspected both actual/diff pairs and explicitly approved the
two font-change captures shown beside their references above. Geometry,
icons and data are unchanged. Their new hashes and source revision are in
the Shell manifest; English captures, FABs and comparison settings are unchanged.
A fresh comparison of these deliberately approved baselines and the complete
runner remain required. Desktop card parent IDs now use available width;
agent status wraps when its translated label cannot fit, and the selected
Board/List underline uses the source's gold token.

The corrected Shell baselines pass strictly at `e1c2d1a`, with all four
projects using unchanged comparison settings. Calendar's final density
refinement follows source line 1973: 56 px day hours, 44 px week hours and
hourly labels, applied through the installed controls API so native gesture
geometry remains coherent. The existing 24-hour scheduling range and
15-minute drag/resize snapping stay. Its existing phone flow now verifies
both grid scales across view changes; browser execution and fresh Calendar
captures remain pending.

The `e1c2d1a` diagnostic run passed strict comparisons for Shell, Today,
Projects board/list, task detail, review plus scrolled deliverables, Inbox and
Me. Native inspection prompted three final source repairs: desktop board
controls occupy their own row when visible, the phone task toolbar remains
sticky, and inactive desktop Inbox rows use the source's compact typography
and spacing. Selected, hovered or keyboard-focused Inbox rows expand their
existing actions to preserve the 44 px target floor. No handlers, permissions
or data are replaced with prototype simulations.

Me's desktop diagnostic captures exposed a capture readiness gap: the lazy
sidebar had not mounted when the body was captured. Both capture runners now
wait explicitly for the sidebar and its three real agent links. Those blank
sidebar images are not approved baselines. Fresh captures of the final source
and the complete behavior/performance gates remain required; diagnostic
generation followed by self-comparison alone does not approve a screen.

The completed `e1c2d1a` diagnostic pass covers all fifteen non-Calendar
screens, with generation and strict self-comparison succeeding. Native review
also exposed the Team fragment context and the old organization chooser;
both required product fixes rather than baseline approval. Team now selects
its directory context after mounting and on browser fragment/back changes.
The shared chooser ports phone markup 880–894 and desktop 1124–1135, showing
real workspace roles without invented teams or counts. Its phone Create action
opens the existing organization form. Existing Me flows now cover that entry.
Phone Agent, Team, MCP and Notifications use the source's Back navigation
without the underlying main tabs. These changes still require fresh captures.

That diagnostic candidate is superseded without starting release gates; its
evidence is retained and owned disposable resources removed. Production and
the previously accepted QA environment are unchanged. The next capture run
uses a production build/start, the explicit sidebar readiness checks and the
unchanged pixel-comparison settings, matching CI's rendering path.

## projects visual checkpoint — production `e5165f9`

Source 223–279 and 935–1045 supplies the phone board/grouped list and desktop board/table/header. Existing queries, card selection, parent navigation, menus, filters and keyboard move controls remain bound. Desktop action controls occupy their own row on hover/focus; phone list actions reserve space beside avatars and agent chips. Actual ordering, dates, counts, paused runs and 0/5 subtasks remain truthful. The 12 px text and 44 px target floor enlarges source controls. The detail panel retains real metadata, description and permission notice; review is separately captured below them. No synthetic OS chrome.

All 8 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/projects/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / projects | ![Prototype](../ui/reference/phone-en-projects.png) | ![App](../ui/screenshots/ui-parity/projects/phone-en-projects-app.png) |
| phone-en / projects-list | ![Prototype](../ui/reference/extra/phone-en-projects-list.png) | ![App](../ui/screenshots/ui-parity/projects/phone-en-projects-list-app.png) |
| phone-zh-HK / projects | ![Prototype](../ui/reference/phone-zh-projects.png) | ![App](../ui/screenshots/ui-parity/projects/phone-zh-HK-projects-app.png) |
| phone-zh-HK / projects-list | ![Prototype](../ui/reference/extra/phone-zh-projects-list.png) | ![App](../ui/screenshots/ui-parity/projects/phone-zh-HK-projects-list-app.png) |
| desktop-en / projects | ![Prototype](../ui/reference/desktop-en-projects.png) | ![App](../ui/screenshots/ui-parity/projects/desktop-en-projects-app.png) |
| desktop-en / projects-list | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/projects/desktop-en-projects-list-app.png) |
| desktop-zh-HK / projects | ![Prototype](../ui/reference/desktop-zh-projects.png) | ![App](../ui/screenshots/ui-parity/projects/desktop-zh-HK-projects-app.png) |
| desktop-zh-HK / projects-list | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/projects/desktop-zh-HK-projects-list-app.png) |

## task-detail visual checkpoint — production `e5165f9`

Source 791–934 and 1034–1214 supplies task identity, parent navigation, title, field rows and content hierarchy. Phone opens the existing bottom sheet over Projects; desktop uses the right panel. House field pickers bind real NW145 owner, unassigned worker, due date, schedule, priority, project and labels. Real description precedes subtasks and comments. Project/Labels and existing editing controls stay available; 44 px targets enlarge source rows. The app does not add synthetic OS chrome.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/task-detail/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / task-detail | ![Prototype](../ui/reference/phone-en-task-detail.png) | ![App](../ui/screenshots/ui-parity/task-detail/phone-en-app.png) |
| phone-zh-HK / task-detail | ![Prototype](../ui/reference/phone-zh-task-detail.png) | ![App](../ui/screenshots/ui-parity/task-detail/phone-zh-HK-app.png) |
| desktop-en / task-detail | ![Prototype](../ui/reference/desktop-en-task-detail.png) | ![App](../ui/screenshots/ui-parity/task-detail/desktop-en-app.png) |
| desktop-zh-HK / task-detail | ![Prototype](../ui/reference/desktop-zh-task-detail.png) | ![App](../ui/screenshots/ui-parity/task-detail/desktop-zh-HK-app.png) |

## review visual checkpoint — production `e5165f9`

Source 791–934 and 1034–1214 supplies the task/review hierarchy and review footer. Existing run, artifact, item decision, comment and permission handlers bind the actual seeded Markdown deliverable. Phone Back/status toolbar and Request changes/Approve footer remain visible after scrolling the deliverable; desktop keeps its source scrollable panel. Real fields, description and permission notice precede review; extra Project/Labels controls remain. The unchecked global decisions stay disabled. Stored Markdown and explicit bilingual sample provenance differ from the prototype PDF; no findings, source files or checklist state are fabricated. Supplemental deliverable captures show a different scroll position from the overview reference.

All 8 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/review/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / review | ![Prototype](../ui/reference/phone-en-review.png) | ![App](../ui/screenshots/ui-parity/review/phone-en-review-app.png) |
| phone-en / review-deliverable | ![Prototype](../ui/reference/phone-en-review.png) (overview reference; app is a supplemental scroll capture) | ![App](../ui/screenshots/ui-parity/review/phone-en-review-deliverable-app.png) |
| phone-zh-HK / review | ![Prototype](../ui/reference/phone-zh-review.png) | ![App](../ui/screenshots/ui-parity/review/phone-zh-HK-review-app.png) |
| phone-zh-HK / review-deliverable | ![Prototype](../ui/reference/phone-zh-review.png) (overview reference; app is a supplemental scroll capture) | ![App](../ui/screenshots/ui-parity/review/phone-zh-HK-review-deliverable-app.png) |
| desktop-en / review | ![Prototype](../ui/reference/desktop-en-review.png) | ![App](../ui/screenshots/ui-parity/review/desktop-en-review-app.png) |
| desktop-en / review-deliverable | ![Prototype](../ui/reference/desktop-en-review.png) (overview reference; app is a supplemental scroll capture) | ![App](../ui/screenshots/ui-parity/review/desktop-en-review-deliverable-app.png) |
| desktop-zh-HK / review | ![Prototype](../ui/reference/desktop-zh-review.png) | ![App](../ui/screenshots/ui-parity/review/desktop-zh-HK-review-app.png) |
| desktop-zh-HK / review-deliverable | ![Prototype](../ui/reference/desktop-zh-review.png) (overview reference; app is a supplemental scroll capture) | ![App](../ui/screenshots/ui-parity/review/desktop-zh-HK-review-deliverable-app.png) |

## inbox visual checkpoint — production `e5165f9`

Source 280–322 and 1010–1034 supplies the header/tabs, avatar, actor/status/time, task, two-line excerpt, status badge and inline actions. Existing real grouped inbox queries, mark-read, snooze, review and grant routes remain bound. Desktop inactive rows are compact; selected, hover and keyboard focus expose existing 44 px actions. Phone actions remain visible. Actual four items, two reviews, one blocker, unread count, newest-first ordering and stored sample provenance are retained; selected state does not fabricate a read mutation. Approve and Grant access open the existing review/profile flows. The existing extra mark-read control and accessibility floor remain.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/inbox/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / inbox | ![Prototype](../ui/reference/phone-en-inbox.png) | ![App](../ui/screenshots/ui-parity/inbox/phone-en-app.png) |
| phone-zh-HK / inbox | ![Prototype](../ui/reference/phone-zh-inbox.png) | ![App](../ui/screenshots/ui-parity/inbox/phone-zh-HK-app.png) |
| desktop-en / inbox | ![Prototype](../ui/reference/desktop-en-inbox.png) | ![App](../ui/screenshots/ui-parity/inbox/desktop-en-app.png) |
| desktop-zh-HK / inbox | ![Prototype](../ui/reference/desktop-zh-inbox.png) | ![App](../ui/screenshots/ui-parity/inbox/desktop-zh-HK-app.png) |

The design-system mapping now includes `components/ui/Badge` at `c794b47`,
forwarding the same span props for Inbox and task/review status labels. A
source-equivalence check confirmed unchanged classes, children, test IDs and
handlers; scoped Biome and web typecheck pass. Fresh final visual comparisons
will validate this DOM-preserving extraction. MCP connection badges remain
absent where the actual API supplies no connection/OAuth state.

## me visual checkpoint — production `e5165f9`

Source 323–375 supplies the 28 px header, 56 px avatar, hairline navigation rows and segmented preferences. Existing user/workspace/member queries and language/theme/notification/sign-out handlers remain bound. Authenticated Alex, actual Admin role and Northwind remain; no Product team is invented for this user. Team counts five people and three agents use actual members. Notification summary shows four enabled categories and daily digest 09:00. Open MCP settings is honest navigation; no unsupported Running claim appears. More settings retains existing controls, and Sign out replaces the prototype Reset demo action. All three supported locales and 44 px targets remain. Desktop is a responsive extension with real Sidebar; no desktop Me prototype exists.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/me/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / me | ![Prototype](../ui/reference/phone-en-me.png) | ![App](../ui/screenshots/ui-parity/me/phone-en-app.png) |
| phone-zh-HK / me | ![Prototype](../ui/reference/phone-zh-me.png) | ![App](../ui/screenshots/ui-parity/me/phone-zh-HK-app.png) |
| desktop-en / me | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/me/desktop-en-app.png) |
| desktop-zh-HK / me | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/me/desktop-zh-HK-app.png) |

## type visual checkpoint — production `e5165f9`

Source 223–279/935–1214 and TH.dark supplies the type, board density and light/dark tokens. Phone title is 28 px; card text follows the actual source at 14 px phone and 13 px desktop; metadata respects the 12 px minimum. The later source-port instruction takes precedence over a uniform 15 px card scale. Focused desktop controls occupy their own 44 px row. Dark background, surfaces, inverse buttons, text, borders and restrained gold map existing tokens; no legacy white-control leakage remains. Existing data/order, paused runs, actual counts, extra task fields and 44 px accessible controls retain the documented Projects/Task differences. These captures demonstrate the scale on the real Projects board; no separate fictional type-scale route is introduced.

All 8 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/type/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / type | ![Prototype](../ui/reference/phone-en-projects.png) | ![App](../ui/screenshots/ui-parity/type/phone-en-type-app.png) |
| phone-en / type-dark | ![Prototype](../ui/reference/dark/phone-en-projects.png) | ![App](../ui/screenshots/ui-parity/type/phone-en-type-dark-app.png) |
| phone-zh-HK / type | ![Prototype](../ui/reference/phone-zh-projects.png) | ![App](../ui/screenshots/ui-parity/type/phone-zh-HK-type-app.png) |
| phone-zh-HK / type-dark | ![Prototype](../ui/reference/dark/phone-zh-projects.png) | ![App](../ui/screenshots/ui-parity/type/phone-zh-HK-type-dark-app.png) |
| desktop-en / type | ![Prototype](../ui/reference/desktop-en-board.png) | ![App](../ui/screenshots/ui-parity/type/desktop-en-type-app.png) |
| desktop-en / type-dark | ![Prototype](../ui/reference/dark/desktop-en-board.png) | ![App](../ui/screenshots/ui-parity/type/desktop-en-type-dark-app.png) |
| desktop-zh-HK / type | ![Prototype](../ui/reference/desktop-zh-board.png) | ![App](../ui/screenshots/ui-parity/type/desktop-zh-HK-type-app.png) |
| desktop-zh-HK / type-dark | ![Prototype](../ui/reference/dark/desktop-zh-board.png) | ![App](../ui/screenshots/ui-parity/type/desktop-zh-HK-type-dark-app.png) |

## notifications visual checkpoint — production `e5165f9`

Source 613–635 supplies Back navigation, compact title, preference rows, digest time and quiet-hours hierarchy. House Switch and existing preference query/update handlers retain real enabled categories, digest 09:00 and disabled quiet hours. Actual UTC, busy/error states, device opt-in and delivery history remain accessible. Phone push view covers tabs and FAB; desktop retains the real Sidebar as a responsive extension. Foreground-alert wording does not promise unsupported device delivery. The 44 px target and 12 px text floor applies; no synthetic OS chrome or desktop prototype is invented.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/notifications/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / notifications | ![Prototype](../ui/reference/extra/phone-en-notifications.png) | ![App](../ui/screenshots/ui-parity/notifications/phone-en-app.png) |
| phone-zh-HK / notifications | ![Prototype](../ui/reference/extra/phone-zh-notifications.png) | ![App](../ui/screenshots/ui-parity/notifications/phone-zh-HK-app.png) |
| desktop-en / notifications | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/notifications/desktop-en-app.png) |
| desktop-zh-HK / notifications | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/notifications/desktop-zh-HK-app.png) |

## agent visual checkpoint — production `e5165f9`

Source 636–666 supplies Back, 56 px agent icon, 22 px name, tasks and segmented permission rows. Existing member lookup supplies actual supervisor Lin Xiao; NW141 and Needs review use real task/run queries. Ten capability tags represent current permissions, rather than inventing the prototype three skills or client metadata unavailable in the DTO. Allow/Ask/Deny retains authorization, busy/error and session/snapshot guards. Phone push view covers tabs/FAB, and both desktop Sidebars render; desktop is an adaptive extension with no native prototype. The 44 px target and 12 px text floor remains; no provider, health or performance claim is fabricated.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/agent/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / agent | ![Prototype](../ui/reference/phone-en-agent-profile.png) | ![App](../ui/screenshots/ui-parity/agent/phone-en-app.png) |
| phone-zh-HK / agent | ![Prototype](../ui/reference/phone-zh-agent-profile.png) | ![App](../ui/screenshots/ui-parity/agent/phone-zh-HK-app.png) |
| desktop-en / agent | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/agent/desktop-en-app.png) |
| desktop-zh-HK / agent | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/agent/desktop-zh-HK-app.png) |

## quick-add visual checkpoint — production `e5165f9`

Source 791–830 and 1137–1139 supplies the phone bottom-flush sheet and desktop dialog at top 120 px, width 600 px. Existing parser request, manual Detect action, editable title and six real field pickers remain; confirmation creates separately from parsing. House buttons and fields retain 44 px targets and 12 px minimum text. One real example, explicit Detect control and extra Labels remain documented differences. These captures open the FAB without parsing or creating, and the desktop backdrop is actual Today rather than the prototype Projects page. No AI/provider execution or success is fabricated.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/quick-add/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / quick-add | ![Prototype](../ui/reference/extra/phone-en-quick-add.png) | ![App](../ui/screenshots/ui-parity/quick-add/phone-en-app.png) |
| phone-zh-HK / quick-add | ![Prototype](../ui/reference/extra/phone-zh-quick-add.png) | ![App](../ui/screenshots/ui-parity/quick-add/phone-zh-HK-app.png) |
| desktop-en / quick-add | ![Prototype](../ui/reference/extra/desktop-en-quick-add.png) | ![App](../ui/screenshots/ui-parity/quick-add/desktop-en-app.png) |
| desktop-zh-HK / quick-add | ![Prototype](../ui/reference/extra/desktop-zh-quick-add.png) | ![App](../ui/screenshots/ui-parity/quick-add/desktop-zh-HK-app.png) |

## Final source repairs before sealed validation

Fresh production inspection found Calendar day hatching/month date fill
(`95c4829`), a desktop organization menu below board cards (`c030dc9`), and
missing Team Invite/supervisor/capability details (`8b2e597`). The source
styles and existing real handlers/queries now supply those details. Team
workload labels in all three locales now say open tasks, matching the actual
count. Existing Me/guest browser cases exercise permitted Invite navigation
and absence of guest role/invite controls; both capture harnesses wait for
the three real agent profiles. These four screens require fresh captures
before acceptance; no earlier candidate images approve the repairs.

MCP agent and task owner/worker selectors now use the existing identity-aware
canonical name presenter (`d595c78`), preserving edited names and option IDs.
Local lint (265 files) and all six type checks pass. There are 62 accepted
native captures; Calendar, Team, MCP and Organizations (24 captures) await
fresh production inspection. Full browser and performance gates remain pending.

## calendar visual checkpoint — production `a93ca59`

Source 115–222 supplies the compact month navigation, segmented day/week/month controls, week strip, unscheduled chips and time grids. Existing ScheduleX gestures, recurring events, keyboard scheduling and resize handlers remain bound to real data. Day uses 56 px and week 44 px hourly axes, with the existing 08:00 initial scroll and month top reset. Dashed agent work restores the exact 135-degree 6 px source hatch in day view, and month today uses inverse tokens. Five actual unscheduled tasks and four unread items, real durations/run states, 44 px controls/short events, 12 px text floor, additional scheduling controls behind the hint, unscheduled tray in all modes and a wrapped year-bearing phone header remain explicit behavior/data/accessibility differences. Native SDK event chips use accessible height, increasing populated month rows; no visual-only times or task counts are fabricated. Desktop is an adaptive extension, without a desktop Calendar prototype.

All 12 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/calendar/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / calendar | ![Prototype](../ui/reference/phone-en-calendar.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-en-calendar-app.png) |
| phone-en / calendar-week | ![Prototype](../ui/reference/extra/phone-en-calendar-week.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-en-calendar-week-app.png) |
| phone-en / calendar-month | ![Prototype](../ui/reference/extra/phone-en-calendar-month.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-en-calendar-month-app.png) |
| phone-zh-HK / calendar | ![Prototype](../ui/reference/phone-zh-calendar.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-zh-HK-calendar-app.png) |
| phone-zh-HK / calendar-week | ![Prototype](../ui/reference/extra/phone-zh-calendar-week.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-zh-HK-calendar-week-app.png) |
| phone-zh-HK / calendar-month | ![Prototype](../ui/reference/extra/phone-zh-calendar-month.png) | ![App](../ui/screenshots/ui-parity/calendar/phone-zh-HK-calendar-month-app.png) |
| desktop-en / calendar | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-en-calendar-app.png) |
| desktop-en / calendar-week | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-en-calendar-week-app.png) |
| desktop-en / calendar-month | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-en-calendar-month-app.png) |
| desktop-zh-HK / calendar | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-zh-HK-calendar-app.png) |
| desktop-zh-HK / calendar-week | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-zh-HK-calendar-week-app.png) |
| desktop-zh-HK / calendar-month | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/calendar/desktop-zh-HK-calendar-month-app.png) |

## mcp visual checkpoint — production `a93ca59`

Source 711–790 supplies Back navigation, Settings label, 28 px title, introduction, endpoint field/copy action, client configuration panel and credential/tool sections. Existing token issuance, scopes, agent choice, revocation, call logs and clipboard handlers remain bound and authorized. Canonical agent labels translate with the identity-aware presenter; edited names and option IDs remain untouched. Actual Tokens 0 and the local isolated endpoint/config are displayed. OAuth discovery, registration/client metadata and provider health unavailable in the current API remain explicit M9 gaps; no connected badge, DCR toggle, fictional clients or token are invented. Real token controls remain below the initial fold. Phone is a push view without tabs/FAB; desktop is an adaptive extension with Sidebar and no native desktop MCP prototype. All controls retain 44 px targets and 12 px minimum text.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/mcp/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / mcp | ![Prototype](../ui/reference/phone-en-mcp.png) | ![App](../ui/screenshots/ui-parity/mcp/phone-en-app.png) |
| phone-zh-HK / mcp | ![Prototype](../ui/reference/phone-zh-mcp.png) | ![App](../ui/screenshots/ui-parity/mcp/phone-zh-HK-app.png) |
| desktop-en / mcp | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/mcp/desktop-en-app.png) |
| desktop-zh-HK / mcp | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/mcp/desktop-zh-HK-app.png) |

## organizations visual checkpoint — production `a93ca59`

Source phone organization sheet 880–894 and desktop chooser 1124–1135 supply the shared organization choices. Phone uses the bottom sheet, 36 px tiles, 15 px names, real role sublines and Create organization navigation to the existing form. Desktop uses the compact 314 px popover, 24 px tiles, 13 px names, 44 px rows and selected check. Its complete border and selected row now render above board cards through the open-Sidebar stacking context. Both variants show the actual five authorized workspaces and preserve workspace-selection/cache guards; no team/member counts are invented. Alex and actual Admin roles are retained. Tokens, restrained gold selection, keyboard interaction and the 44 px/12 px floors remain.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/organizations/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / organizations | ![Prototype](../ui/reference/phone-en-organizations.png) | ![App](../ui/screenshots/ui-parity/organizations/phone-en-app.png) |
| phone-zh-HK / organizations | ![Prototype](../ui/reference/phone-zh-organizations.png) | ![App](../ui/screenshots/ui-parity/organizations/phone-zh-HK-app.png) |
| desktop-en / organizations | ![Prototype](../ui/reference/desktop-en-organizations.png) | ![App](../ui/screenshots/ui-parity/organizations/desktop-en-app.png) |
| desktop-zh-HK / organizations | ![Prototype](../ui/reference/desktop-zh-organizations.png) | ![App](../ui/screenshots/ui-parity/organizations/desktop-zh-HK-app.png) |

## Server cleanup and capture transport — 2026-10-10

A fresh stage stopped at the unchanged 12 GiB free-space guard. Eleven
superseded, unvalidated UI candidates retained duplicate dependencies and
build output. Removed only their dependency/build caches, preserving source
archives, tracked source and every screenshot/report; archive and evidence
hashes remained unchanged. Docker reclaimed another 3.582 GB of unused
build cache. Free space reached 25.01 GiB, approximately 13 GiB recovered.
Running services, database volumes, pinned/rollback images and accepted QA
passed preservation checks. Other projects' live data and backups remain.

Intermittent direct SSH download timeouts also delayed captures. The
existing configured SSH hop fetched the four immutable MCP PNGs successfully
and matched every original SHA-256 hash. Remaining validation uses that
transport; source ownership, runtime, fixture and test guards stay unchanged.

## team visual checkpoint — production `9d395f8`

Source 667–710 supplies Back navigation, 28 px Team title, People and Agents sections, 36 px member avatars, supervisor/status/capability groups and the 44 px Invite row. Agent icons now align beside their names, matching the source. Existing member, agent-profile, task and run queries supply five people, three agents, actual supervisors, roles and open-task counts; ten actual permission capabilities replace unavailable fictional skill/client metadata and make real agent rows taller. Invite uses the existing authorized dialog and canInvite guard; role controls retain canManageRoles, session/snapshot and core authorization. Actual Admin/member controls remain accessible, and all three locale workload labels accurately say open tasks. Phone is a push view without tabs/FAB; desktop retains Sidebar as an extension without a native desktop reference. No data or authorization rules change.

All 4 native images were inspected by root. Independent production comparisons passed unchanged settings. Behavioral and full performance acceptance remains pending. [Capture manifest](../ui/screenshots/ui-parity/team/manifest.json).

| Capture | Prototype reference | Accepted real app |
| --- | --- | --- |
| phone-en / team | ![Prototype](../ui/reference/extra/phone-en-team.png) | ![App](../ui/screenshots/ui-parity/team/phone-en-app.png) |
| phone-zh-HK / team | ![Prototype](../ui/reference/extra/phone-zh-team.png) | ![App](../ui/screenshots/ui-parity/team/phone-zh-HK-app.png) |
| desktop-en / team | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/team/desktop-en-app.png) |
| desktop-zh-HK / team | No desktop prototype; responsive app evidence | ![App](../ui/screenshots/ui-parity/team/desktop-zh-HK-app.png) |

## Integrated visual acceptance ready for validation

All 16 screen sets now have 86 accepted native app/baseline images with
source and reference provenance. Root inspected each native capture;
independent source reviews and unchanged candidate comparisons passed.
The CI loop now names all 16 sets explicitly and cannot update snapshots.
The offline prototype reference matrix also includes six dark-theme and
14 supplemental views, totaling 58 native reference screens.

Team's last repair (`57eeb39`) is a one-line source alignment correction.
No behavioral feature, data contract, authorization rule, comparator mask
or performance threshold was removed or weakened. Full committed-baseline,
120 behavioral cases, nine gates, Lighthouse and three LCP measurements
per locale are still required before pushing. Capture generation is not
a substitute for those checks. Transport compression round-tripped the
38 MiB archive byte-identically at approximately 20 MiB; the original
archive SHA-256 and source manifests remain the validation boundary.


## Cold-load diagnosis — production `54dbdc6`

All 16 committed visual sets passed (64 cases / 86 PNGs). Lint, six type
checks, licence checks, 452 unit tests, builds and the 193.0 KiB initial
JavaScript budget passed. Performance failed: Lighthouse performance was
95/80/80 for en/zh-CN/zh-HK; default three-run LCP medians were
2156/2308/2308 ms against the unchanged 2000 ms limit. The runner stopped
before behavioral and MCP gates. This is a failed candidate, not acceptance.

Sanitized Lighthouse requests show the task preload finishing around
2.74 s and session confirmation around 3.07 s in Chinese. A stylesheet
imported by lazy foreground notifications finished at 4.35 s, immediately
before the largest task-title paint at 4.43 s. No remaining CJK font
subset was requested. The existing notification stylesheet now imports
once from the root layout rather than its lazy alert/preferences callers,
so it joins the initial CSS instead of blocking a later paint. Styles,
notification behavior and protected-read confirmation remain unchanged.
This repair still requires fresh visual and full performance validation.


## Notification CSS repair check — production `3741520`

All 16 committed visual sets again passed unchanged (64 cases / 86 PNGs).
Lint, six type checks, licences, all 452 unit tests, production builds and
193.0 KiB initial JS passed. Lighthouse now passes every locale:
performance 97/90/90, accessibility 96/96/96 and best practices 100/100/100.
Default three-run LCP medians improved to 1928/2128/2128 ms for
en/zh-CN/zh-HK. English passes; both Chinese medians still exceed the
unchanged 2000 ms limit. This candidate failed before the 120 behavioral
cases and MCP gate. No push or live UI deployment is claimed.

A separate traced diagnostic uses the same immutable source read-only,
pinned runtime and disposable database with providers disabled. Its
instrumented timing is diagnostic evidence only, never an acceptance run.


## CJK font request priority

The traced Chinese cold load downloads the 56 KiB common CJK font while
initial application scripts are still downloading. A browser experiment
with the exact unchanged font bytes reports default priority VeryHigh;
an explicit font preload with fetchpriority=low reports Low, without a
later promotion when CSS uses the face. The experiment used no API,
database or credentials, an isolated network and read-only mounts.

Chinese root layouts now emit that low-priority hint in the initial head.
Font files, glyphs, metrics, CSS, optional display and session confirmation
remain unchanged. The existing JavaScript-disabled locale test checks the
head hint for both Chinese locales and its absence for English/invalid
preferences. Fresh visual and original performance validation is pending;
the priority experiment is not an acceptance result.

## Server cleanup and review preparation — 2026-10-10

The user requested a current space inventory and deletion of obsolete builds
and archives. Guarded cleanup removed 87 unused generated directories and
reproducible Git archives, recovering 13.93 GiB of actual filesystem space.
Main-disk free space increased from 19.87 to 33.80 GiB during the operation;
the separate TIANSIGHT disk remains unchanged at 75.92 GiB free. All 1,092
protected evidence files retained their hashes. Accepted QA source/archive,
runtime and original runner checks passed, and existing services retained
their identities, images, start times and health. Live Taff image tags remain
`55b315b743a18113bed864191eb74c6f1d997d9b`.

All 16 visual sets passed against unchanged committed baselines for `de44b79`
(64 cases / 86 PNGs). The actual anonymous Chinese HTML includes the font hint
in the initial head with low priority. Fresh lint, types, licences, all 452
unit tests, builds and 193.0 KiB initial JS passed. Lighthouse passed
98/91/90 performance in en/zh-CN/zh-HK. Default three-run LCP medians were
1932/2152/2132 ms against 2000 ms; Chinese remains over budget. The runner
exited 1 before the 120 behavioral cases and MCP smoke. This is a failed
candidate, not release acceptance; no push or UI deployment is claimed.
The [space inventory and deployment handoff](../reviews/2026-10-10-server-space-and-deployment-readiness.md)
lists retained material, removed targets and the remaining deployment checks.

## Review fixes (2026-10-10, after PR #2 review)

The review in `docs/ui/review-2026-10-10/pr-2-review.md` found the port
right and the branch not mergeable. Fixed on the branch:

- **Real task references.** `workspaces.key` and `tasks.number` (migration
  0021 backfills existing rows: key from the name, numbers in creation
  order) replace the fixture-only `prototypeTaskReference`. Core assigns the
  next number under the workspace row lock; `taskReference(key, number)`
  renders `NW-141` for any workspace, and search hits carry the workspace
  key. The prototype seed sets `NW`, `QS` and `ME` and the prototype numbers.
- **No fixture code in the client.** `presentPrototypeField`, the fixture
  team label and the agent-chip hack are gone from `apps/web`; stored names
  and titles render as stored. The seed's review disclaimer is zh-HK only.
- **Browser suite.** The seven failing cases pass: a screen heading for
  assistive tech beside the calendar's month label; the calendar editor
  closes when its task link opens the task sheet; schedule fields show
  minutes unless an instant carries seconds; board card controls keep their
  position on hover, sit above the footer chips and columns stretch to the
  board height so a drag reaches its handle and every column is a drop
  target; the invitation list element is always present; the scroll, cache
  and held-chunk tests assert what the layout guarantees.
- **Smaller items.** Today shows six unscheduled runs and links to Projects
  for the rest; digest Inbox rows carry a dated title and a real excerpt;
  desktop Projects opens the most recently updated project.
- **Critical CSS.** Route stylesheets are imported by the component that owns
  their classes, so Today ships 13 KB of CSS gzipped instead of 21 KB; the
  session request is a real `<link rel="preload">` (the `preload()` call
  emitted nothing in the production HTML) and is only emitted when the
  server already saw a session, because a preloaded 401 was otherwise
  reused by the first read after signing in; the low-priority CJK font
  hint stays (dropping it brought no measurable gain and the i18n spec
  asserts it); the head script preloads tasks, members and runs at low
  priority.
- **Production-only failures.** The invitation fragment came back after a
  sign-in round trip: the app router copies the hash it finds at start-up
  into its route state, so a child effect that stripped it and replaced the
  same path restored the token, and the next Link to the page pushed it
  again. An inline boot script now removes `#invite=` before React hydrates
  and hands the token over through a one-shot global. The calendar page
  builds its day and week keys with the same instant text as Today, so one
  persisted read serves both screens; the persistence spec waits for that
  read to hold the task before gating the network, and the optimistic
  rollback spec's fixtures carry the workspace key and task number.
- **Validation.** Lint, typecheck, unit tests and the MCP smoke pass. The
  browser suite was run against the production build on this sandbox's
  Chromium 141 with Playwright 1.56.1 (the pinned 1.64 browser cannot be
  downloaded here): 120 of 120 cases pass. The SSR session spec needs the
  production server: `next dev` answers `Cache-Control: no-store` without
  `private`, so it fails locally against the dev server by design.

Still open:

- **LCP.** On this sandbox the production build measures about 2.3–2.5 s in
  en and 2.5–2.7 s in zh-HK with ±150 ms run-to-run noise, no better than
  before the CSS changes. The trace shows why: after the scripts arrive
  (~1.7 s on simulated slow 4G) the shell needs about 650 ms of main-thread
  work before the first list paints, and the layout's client chunk
  (`app/layout-*.js`) is not among the initial scripts, so hydration waits
  one more round trip for it, then for the cache-persistence chunk. Getting
  under 2 s needs the shell's hydration cascade shortened (one render pass
  from preloaded data, confirmation not gating the first paint) and that
  chunk in the initial script list.
- **Visual baselines.** The English captures that showed fixture
  translations, the Today run cap, the digest row and the board columns
  changed; regenerate the committed baselines with the parity runner on the
  Linux Chromium that CI uses (this sandbox cannot download that build).
