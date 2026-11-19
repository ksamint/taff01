# 136 · v0.2.26 Chinese punctuation (G3)

- Base: `455c549` (`origin/main`); isolated branch `fix/v026-cjk-punctuation`.
- Reproduced G3 in the shipped locale resources: six ASCII commas between CJK
  characters in each of zh-CN and zh-HK, including `summary.emptyHint`.
- Replaced all 12 with `，`; no CJK-adjacent ASCII full stops existed.
- Regression checks both commas and full stops across both complete dictionaries.
- Updated DS-5.3 and its acceptance evidence in `docs/spec/daily-summary.md`.
- Red: locale regression 2 failed / 8 passed before the copy changes.
- Green: locale + unchanged `scripts/ui/fonts.test.ts`: 13 passed, 2 files.
- Biome: 3 touched TS/JSON files passed; web typecheck (app + service worker) passed.
- Frozen offline install completed with zero downloads; no dependencies changed.
- G5: desktop `/me` intentionally defaults to its Inbox tab (`me-desktop.tsx`);
  `/inbox` directs to that same InboxView (`inbox-view.tsx`); no fix required.
- Missing: production-build GUI probe and full local gate remain for the parent
  after L1; no full gate, push, PR, merge or deployment run in this preparation.
- Open decisions: none; font assets, baselines and tolerances unchanged.
