# 23 — Simple signed-out home

Date: 2026-10-16. Decision record: ADR 0018.

## Working

- The signed-out home shows the wordmark, the language picker, one headline
  and the sign-in form. Feature cards, eyebrow, subtitle and extra buttons
  are gone.
- The headline rotates every 4 seconds: 做事，要 Taff 實。, Taff 上正軌。,
  Taff 平難關。 (zh-CN and en have matching lines). Reduced motion holds the
  first line.
- Visitors without a saved choice get Traditional Chinese unless the browser
  prefers English or Simplified Chinese. Hong Kong and Macau browsers get it
  in any language. The server reads Accept-Language, so the first paint
  matches.
- With SMS on, the field reads "username, mobile or email". A mainland mobile
  number drops the password and texts a code straight away. The separate SMS
  button is gone.

## Missing

- The `home` visual baselines (light and dark, all six projects) need a fresh
  capture through the Capture visual baselines workflow, then approval.
- Production is not redeployed.

## Open decisions

- `en-HK` browsers now get Traditional Chinese. Say if they should get English.
- A numeric username that is also a valid mainland mobile number goes to the
  code flow while SMS is on.

## Validation

- Biome and the web typecheck pass. Web unit tests: 202/202, including new
  locale-detection, Accept-Language and mobile-number cases.
- Browser flows for SMS, username sign-in and saved locale: 21/21 across en,
  zh-CN and zh-HK, on a local stack (Postgres 16, Redis).
- Full browser suite: running; result to follow.
- Screenshots checked by eye: phone zh-HK, phone with a mobile number typed,
  desktop with a Japanese browser (Traditional Chinese), phone en.
