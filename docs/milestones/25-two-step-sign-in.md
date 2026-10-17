# 25 — Two-step sign-in and the designed landing look

Date: 2026-10-17. Decision record: ADR 0020.

## Working

- Sign-in asks only for the account first (username, mobile or email) and
  Continue. The next step shows the account with 更改, then a password, or the
  SMS code for a mainland mobile while SMS is on.
- The code step sends nothing until 傳送驗證碼 is tapped. Either step can
  switch to the other method. Sign-up stays one form.
- The landing now follows the design canvas from existing tokens: ink text and
  round ink button, hairline underline fields, ink focus ring, sentence-case
  labels, serif wordmark and headline from system fonts.
- Desktop reserves two headline lines so rotation never moves the form.

## Missing

- `home` visual baselines need a fresh capture and approval.
- Not deployed.

## Open decisions

- Devices without a Chinese serif font show the headline in the bundled sans.
  Bundling a serif subset would add a font file; not done.

## Validation

- Biome and the web typecheck pass. Unit tests for web and scripts: 275/275,
  including font coverage for the new labels and the test-id contract.
- Browser, local stack (Postgres 16, Chromium 1194, dev servers), en, zh-CN
  and zh-HK: sms-auth, username-auth, landing, home-layout, today and i18n
  all pass after fixes. The fixes were a remounted-field warning on sign-up,
  desktop headline wrapping and six signed-out test checks.
- Screenshots checked: identify step, password step, SMS code step (phone,
  zh-HK) and desktop.
