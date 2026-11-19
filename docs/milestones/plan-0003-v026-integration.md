# Plan 0003 · v0.2.26 integration

- P1–P5 distinguish saved and computed progress, consolidate cold reads,
  defer board and agent-detail requests, and separate undated Today tasks.
- S1–S6 compact the phone views and standardize settings navigation.
  The combined phone first timeline row measured 360–383 px, the first
  board card starts at 169 px and the typical card is 115.6 px tall.
- D1–D3 share one Graph entry, move Sectors and Stakeholders and keep old links.
- Q1–Q8 improve the Calendar, Sectors, XIDING ordering, audit, search, Mind
  Map, wide Today layout and font transfers.
- Includes Plan 0002 G1 and G3–G4. S5 supersedes G2; desktop Me's Inbox tab
  is by design (G5). Plan 0002 Rust rails are outside this candidate.
- Branch-level production checks and captures are recorded in each milestone.
- The initial P1 gate passed 14/18, including 2,388 unit/integration tests,
  381 browser tests, three SSR checks and 32 checklist cases. Direct Docker
  Hub access failed. The integration uses an isolated Taff builder with
  Google's public registry mirror. The full gate on the integrated tree
  and the direct release are pending.
- The integrated gate stopped before Playwright when Next.js reported a
  security advisory on 16.4.2. The candidate now locks 16.4.5, the patch
  listed in GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8.
