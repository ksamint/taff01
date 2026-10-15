# v0.2.1 timeline acceptance setup follow-up

The v0.2.1-a phone-zh-HK failure reached no timeline entity creation or bar
interaction. Its first attempt lasted 32,232 ms, with an empty entity journal;
profile/theme restoration passed. Notification cleanup failed during its initial
read, before any restore PATCH. The original safe reporter discarded the primary
exception, so the historical stalled operation/resource cannot be identified
conclusively. A claim that a specific font caused that original attempt would
exceed the retained evidence.

A deterministic regression reproduces a concrete setup defect: holding font
responses open makes the original `page.goto` load-event wait fail at 30,071 ms,
even though the document and application can become usable. The live setup used
this stronger, unrelated document-resource condition in addition to its real
application assertions. This is consistent with the original 30 s navigation
budget, but does not prove the historical resource identity.

The shared live setup now waits for DOMContentLoaded and retains all existing
Today visibility, localized heading, exact admin workspace, selected-workspace
and authenticated identity checks. No sleeps, automatic retries, timeout
increases or weaker timeline assertions are added. The new test keeps real font
requests pending until those checks finish, then releases them in `finally`.
The screenshot/font suites retain their existing font readiness requirements.

Navigation failures now carry fixed operation names and an allowlisted category
in safe reports. Notification cleanup reads use the existing checked cleanup
wrapper, preserving the step and a categorical transport reason before the
request resolves. Raw exception messages, URLs, DOM and credentials stay
suppressed. The original failed acceptance evidence remains unchanged.

## Evidence

Private reports are under `~/.local/state/taff-v021/timeline-investigation/`:

- `run-VVmekj`: unchanged phone-zh-HK move/resize/form/undo passed 5/5, retries 0;
  summary SHA-256 `a50447d03aea808ddf299445e5e8077183cc1c38b90b9e5f95f253639449b415`.
- `run-V8QOUY`: held-font regression with original load readiness failed at
  30,071 ms; safe diagnostic `live setup navigation /|timeout`; summary SHA-256
  `b2caea18ae6f0e81cb8d14ddbb05419f5b8934227f795f3f10c34c0fa9840b19`.
- `run-cDJEw9`: corrected phone-zh-HK held-font setup 5/5 and unchanged
  move/resize/form/undo 5/5, retries 0, ten cleanup journals with zero failures
  and browser page errors; summary SHA-256
  `50b962c36198eb3b8ed08c8a60550a7467db484d3e4ed08d664bddafd6a60a4a`.
- `run-Q28BWQ`: corrected held-font setup and unchanged move/resize/form/undo
  passed 12/12 across phone/desktop × en/zh-CN/zh-HK, retries 0; twelve cleanup
  journals report zero failures and browser page errors. Summary SHA-256
  `417f58bd27dbc7459484bd4884b649e5d22c9942a5f2e37d208e1b8cdcdf29eb`.
- Fast checks: lint, typecheck and 8 harness/contract unit tests passed.

The new setup regression adds six applicable cases to full public acceptance
(one for every phone/desktop locale project). Real SMS and plan §10.2 remain
outside this follow-up.
