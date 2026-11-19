# 142 — v0.2.26 GUI review completion

Status: candidate; complete local gate and publication pending. Production remains v0.2.25.
Targets: TypeScript web/test drivers and existing CSS tokens; no backend or permission change.

- Owner requested faster execution on 2026-11-16; G1, G3 and G4 share one GUI PR and one final full gate. Checks remain unchanged.
- L1 merged as PR108 `96d037e`; its tree exactly matches the clean head that passed all 18 steps.
- G1 reproduced on that production build at 390×844 zh-HK: deliverables started at 0px instead of the title's 20px gutter.
- Plan 0003 S5 supersedes G2. The original summary-only gutter and its
  test were excluded when adopting `a0aeca4` on the current queue.
- Standalone phone review uses the existing page gutter. The review check
  measures its bounds and overflow in all locales and retains desktop checks.
- G3 fixes twelve real CJK commas and adds punctuation/font coverage; milestone 136 records its focused evidence.
- G4 adds Sectors and Export image dialog captures using the existing pinned Linux pipeline; eight Linux references captured and visually inspected; all eight unchanged-reference comparisons passed.
- G5 remains closed by design: desktop Me opens its Inbox tab.
- Original production comparison reproduced the review gutter defect and
  passed the three localized review cases after the fix.
- Capture/clock/locale/font/test-contract checks: 32 passed; typecheck and lint passed.
- Linux captures: 8 passed, 0 failed; real rendered PNG preview, fixed API export clock, no image mocks or masks. Manifest records actual source, runtime and SHA256.
- Candidate browser, pinned-reference and full-gate results will be bound to the final clean commit/tree in the PR body.
- Specs: client navigation CN-10, daily summary DS-5.3 and existing tooling capture contracts.
