# Runtime SQL deadline

The isolated runtime used `statement_timeout=0` and `idle_in_transaction_session_timeout=0`. Before this change, aborting an HTTP client did not release its blocked database query until the external lock was released. Ten such requests could occupy the ten-connection application pool.

`createCore` now supplies a 20,000 ms statement timeout to its database connection. Explicit `DATABASE_URL` parameters retain postgres.js precedence, including an intentional operator value of zero. Raw `connectDatabase` callers, including migration/maintenance paths, do not receive this runtime default. No global PostgreSQL settings change.

Validation in `statement-timeout.integration.test.ts` checks the actual runtime setting is `20s`, the maintenance connector remains unchanged, explicit zero is preserved, and an HTTP-aborted query releases its backend while the external blocker remains held. The latter test uses an explicit 500 ms deadline, observes SQLSTATE `57014` and an idle/reusable backend, then verifies normal HTTP operation after releasing the blocker. A separate transaction inserts a row before timing out; the inserted row is rolled back and the pool remains usable.

The deadline bounds each active SQL statement. It does not provide immediate browser-abort cancellation, bound client-side pool queue time, or impose a total deadline across multiple statements or idle JavaScript work inside a transaction. These distinctions match [PostgreSQL18's timeout definitions](https://www.postgresql.org/docs/18/runtime-config-client.html).
