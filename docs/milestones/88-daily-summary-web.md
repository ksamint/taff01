# 88 — Daily summary S3: web pages, watermark, project tags (2026-11-05)

Plan: [ADR 0027](../adr/0027-shareholder-daily-summary.md), goal S3. Follows [87](87-daily-summary-delivery.md).

## Works

- Projects: header chips `Shareholder · {org}` for non-guests; admins tag
  from the edit dialog, saved at once with an Undo toast that sends the old set.
- `/orgs/summaries` (admins, linked from Organizations): tags, recipients
  (account or link only, language, zone, time, finance/names switches,
  pause), preview, and the summaries list.
- `/summaries` and `/summaries/[id]` (Me row) with print; admins create,
  copy once, list and revoke share links there, revoke behind a confirm step.
- `/s/[token]`: server-rendered in the recipient's language, outside the
  shell, watermark on screen and in print, hash in the footer, `noindex`,
  `no-referrer`; dead links are a 404 with `no-store`.
- Strings in en, zh-CN, zh-HK; 13 glyphs added to the font subsets.

## Missing

- Visual baselines for the new screens (approved Linux workflow only).
- Public page JavaScript is 187.5 KiB against a 50 KiB target; needs a
  second root layout (owner decision; ADR notes, S3).
- S4 release docs and closeout.

## Validation

| Check | Result |
| --- | --- |
| `e2e/summaries.spec.ts`, en/zh-CN/zh-HK | 3 passed, 3 repeated runs |
| Me, projects, landing, Today, i18n, organization specs, all locales | 33 passed |
| Today initial JS (`pnpm perf:budget`) | 192.5 KiB of 200 KiB |
| Full `pnpm test` | 1,955 passed, 1 failed (pre-existing on `main`, see 86) |
| Lint, licence gate, typecheck of six packages, production web build | clean |

Browsers ran on the preinstalled Chromium through a scratch config, because
the pinned Playwright's own browser build is not installed here.
