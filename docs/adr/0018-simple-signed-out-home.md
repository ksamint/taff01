# 0018 — Simple signed-out home and Traditional Chinese default

Date: 2026-10-16. Status: accepted. Amends ADR 0014 D3 (signed-out landing).

## Context

The owner found the signed-out home too complex. Prototype v2 gives it a top
bar with a sign-in button, a hero with a "Get started" button, three feature
cards and the sign-in form at the bottom. The owner asked for the simplest
possible page, Traditional Chinese by default, and one field that takes a
username, mobile number or email.

## Decision

- The signed-out home shows only the wordmark, the language picker, one
  headline and the sign-in form. The feature cards, eyebrow, subtitle and the
  extra buttons are removed.
- The headline rotates every 4 seconds through three lines in each locale. In
  Traditional Chinese they are 做事，要 Taff 實。, Taff 上正軌。 and
  Taff 平難關。, puns on 踏 (tà). Reduced motion keeps the first line.
- Without a saved choice, the locale is Traditional Chinese unless the browser
  prefers English or Simplified Chinese. Any Hong Kong or Macau browser gets
  Traditional Chinese, including `en-HK`. The server reads `Accept-Language`
  so the first paint is already in that language.
- The sign-in field is labelled "username, mobile or email" when SMS is on.
  A mainland mobile number removes the password field and sends a code,
  because phone accounts have no password. The separate SMS button is gone.

## Consequences

- A numeric username that is also a valid mainland mobile number goes to the
  code flow while SMS is on. Usernames like that are unlikely.
- The `home` visual baseline must be regenerated.
- English visitors outside Hong Kong and Macau still get English, so new
  accounts keep the language their browser asks for.
