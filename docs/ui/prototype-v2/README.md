# Prototype v2 — Human-AI task collaboration

Approved replacement for `../prototype/` (v1). From the frontend-v2 work
onward this folder is the UI source of truth; v1 stays only as the
reference the current `main` app was ported from. The implementation plan is
[`../../frontend-v2-plan.md`](../../frontend-v2-plan.md) and the agent goal is
[`../../agent-goal-frontend-v2.md`](../../agent-goal-frontend-v2.md).

## Provenance

Imported on 2026-10-14 from the upload
`Human-AI_task_collaboration_prototype_2.zip`
(SHA-256 `08ee5ea355b3044f73c702ad1770c9fb909da5a74244aec21bd1db90dc19efb4`).
File names are kept exactly: `<dc-import name="Team Tasks Module Plan">`
resolves `Team Tasks Module Plan.dc.html` by name, so renaming breaks the
embedded modules.

| File | Role |
| --- | --- |
| `Team Tasks.dc.html` | App shell, H5 (390 × 844) and web (1280 × 800) side by side |
| `Team Tasks Module Plan.dc.html` | Embedded module: timeline (`start-page="gantt"`), mind map (`mind`), AI brief (`brief`) |
| `Team Tasks Module Relations.dc.html` | Embedded module: relations graph |
| `taff-store.js` | Prototype data layer (localStorage) with the CRM integrity rules |
| `db/schema.sql` | The designer's PostgreSQL reference schema (not a migration; see the plan) |
| `DEPLOY.md` | The designer's notes: H5 ↔ web parity table, CRM rules, release checklist |
| `support.js`, `_ds/…` | Prototype runtime and the TABLE AI design system |
| `vendor/` | React 18.3.1 UMD (MIT), copied from `../prototype/vendor/` |

Not imported: the upload's `archive/` (superseded versions and screenshots;
its `Audit & Upgrade Plan.md` is byte-identical to
`../prototype/audit-and-upgrade-plan.md`) and `.thumbnail`.

## Local changes (offline viewing only)

1. `support.js` loads React and ReactDOM from `./vendor/` instead of unpkg
   (same SHA-384 integrity values; the files are byte-identical).
2. `_ds/…/tokens/fonts.css` loads Noto Sans TC from
   `../prototype/vendor/NotoSansTC.ttf` instead of Google Fonts, so the
   folder must be served with `docs/ui` as the web root.

The design-system folder is otherwise identical to `../prototype/_ds/`
(only `fonts.css` differed in the upload).

## Viewing

Serve `docs/ui` statically and open
`/prototype-v2/Team%20Tasks.dc.html`; `?reset` clears the saved demo state.
Click 開始 (phone) and 進入工作區 (desktop) to enter the app. Language and
theme are switched in 我的 › 偏好設定.

Smoke result on 2026-10-14 (headless Chromium, every external request
blocked): no page errors and no failed requests. The console shows 45
parse-time SVG attribute errors (`<path d="{{ x.s.half }}">`, `<circle
r="{{ x.s.dot }}">`) from the status-glyph templates before binding; they
are prototype-runtime noise and do not affect rendering.
