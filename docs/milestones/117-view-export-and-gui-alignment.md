# 117 — exported view images and GUI alignment review (2026-11-12)

From `main` `1e05eb9` (v0.2.23 deployed), not released. Plan: [v0.2.24 goal](../agent-goal-v0.2.24-view-export-and-alignment.md).

## Works

- Export image on the projects header: the current project or the workspace
  overview. Core builds the summary's designed layout from live data with the
  exporter's rights; `taff-render` draws it unchanged (1080 px palette PNG,
  ≤ 400 KB, watermark, hash). Preview, Send (Web Share), Copy image, Save.
  [ADR 0031](../adr/0031-exported-view-images.md), [spec](../spec/view-export.md).
- `view:export`: admin and member yes, guest and agent no, in TS `can()` and
  the Rust twin. Nothing stored; 10 per person per minute; the API reads
  `SUMMARY_RENDER_URL` (compose and its test updated).
- Real renderer: project 87–89 KB at 1080×1668; two-project workspace
  131–134 KB at 1080×2474 (en, zh-CN).
- [Owner checks](../owner-checks.md): steps for the summary download and the
  Claude.ai connector check, linked from release closeout.

## GUI alignment review (`1e05eb9`, code read, no browser)

151 REST routes against web callers, specs and `docs/ui/README.md`; locales
1,407 keys each, none missing. Everything else aligned. Gaps, ranked (goal A1–A4):
1. Desktop has no link to `/summaries` (DS-5.2); phone Me only.
2. People cannot see or set project `dueAt`/`deliveryProgress`; summaries and
   exports show "Progress 0%".
3. Workspace archive has no screen and no unarchive route (owner decision).
4. Pending requests show a raw task id, not the title (AM-1.7).

## Validation

Focused, before the gate (PostgreSQL 18.7, Node 26.13.0): export integration
5/5, summaries 8/8, permissions 351, export route 6/6, REST authorization 830,
e2e `view-export.spec.ts` 3/3 locales with the real renderer. The full local
gate on the exact PR head tree is in the PR body.

## Open

- Owner: export audit rows, an agent `views.image` tool, screen-picture
  exports (ADR 0031); A4. Not deployed; production stays v0.2.23.
