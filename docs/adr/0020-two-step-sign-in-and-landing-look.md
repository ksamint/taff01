# 0020 — Two-step sign-in and the designed landing look

Date: 2026-10-17. Status: accepted. Amends ADR 0018 and ADR 0019.

## Context

The owner compared the live signed-out home with the approved design canvas.
The page used the app's default control styling: deep-blue text and button,
boxed fields with a gold focus ring, uppercase English labels, a square button
and a light sans headline. The design has near-black ink, underline-only
fields, a round button and a serif wordmark and headline.

The owner also asked that sign-in always ask for the account first (username,
email or mobile) and only then show a password, or the SMS code for a mobile.

## Decision

- The landing keeps the TABLE AI palette but uses the tokens the design maps
  to: ink `--text-body` for text, button and focus ring, `--border` for
  hairline underline fields, and a 999px button radius. Labels are sentence
  case. No new colour or font file is added.
- The wordmark and headline use a system serif stack: Noto Serif CJK or
  Songti for Chinese, Georgia for Latin. Devices without a CJK serif fall
  back to the bundled sans. Simplified Chinese pages prefer SC faces.
- Sign-in has two steps. Step one has one field and Continue. Step two shows
  the account with a Change link, then either a password or the SMS code.
  - A mainland mobile number goes to the code step when SMS is on, with a
    switch to the password. The code is sent only when the person taps Send
    code, so password users never trigger an SMS.
  - Any other account, or a mobile while SMS is off, goes to the password.
  - Sign-up stays one form.
- A hidden username field in the password step keeps password managers
  paired with the account.

## Consequences

- Every browser sign-in now has one extra tap. All suites click Continue.
- The `home` visual baselines must be captured again.
- The old in-form phone field, Change number and Sign in with email links
  are gone; their translation keys stay for now.
