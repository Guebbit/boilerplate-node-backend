---
source: src/modules/account/tests/contract/reauth.contract.test.ts
sha256: 0df507c2bb0c5771afb04c5705711cce76c321adf2b6e90a38574f1dfb4b0cb4
generated_at: 2026-10-14T09:05:23.685979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/reauth.contract.test.ts

## Purpose

Contract tests for the **step-up re-authentication** endpoints (`GET /account/reauth`, `POST /account/reauth/methods/email/send`, `POST /account/reauth`). They verify which re-auth methods an account is offered, that the emailed code path produces a session claiming only `email` in its `amr`, code-burn / cooldown / wrong-code semantics, and that a stale session can be re-proved. The password path's *session* behaviour (cookie tiers, failed re-mint) is deliberately out of scope and lives in `api.contract.test.ts`.

## Key elements

- **`mockOutbox`** — in-memory array capturing every call to `enqueueEmail` (the mailer adapter is jest-mocked at module level).
- **`mailedCode()`** — pulls the 6-digit `code` from the most recent `account.reauth-code` entry in `mockOutbox`.
- **`sessionFor(amr, withPassword)`** — creates a user (with a password via `createUser`, or password-only via `userRepository.create`) and mints a session carrying the given `amr` claims; simulates what an OAuth callback would leave behind.
- **`reauthByEmail(bearer)`** — two-step helper: requests a code, then submits it to `POST /account/reauth`.
- **Test groups**
  - `GET /account/reauth` — method offering logic (password / email / none) and the 401 contract.
  - `POST /account/reauth/methods/email/send` — mail dispatch, 422 for passworded accounts, 429 cooldown, 422 for unknown methods.
  - `POST /account/reauth` (mailed code) — `amr` reset, single-use code, wrong-code 422, 5-attempt burn, no-send refusal, stale-session re-proof for export and download.
  - `the step-up window` — confirms `NODE_REAUTH_TIME_SENSITIVE` is read per-request, not cached at boot.
  - `POST /account/reauth` (password) — "no password" 422 message, `amr` narrows to `['pwd']` only (second factor not carried).

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`) to register global contract-test assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions an isolated test database before any test runs.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_MAIL_TRANSPORT` to `'outbox'` (so email is offered) and `NODE_REAUTH_TIME_SENSITIVE` for the window test.
- **`tests/support/http.ts`** — `api()` builds the supertest agent; `bearerForCookie` converts a JWT cookie back to a bearer token for stale-session requests.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` drive the time-window and staleness tests.
- **`src/kernel/config.ts`** — `reauthWindowSeconds('sensitive')` supplies the threshold used to advance the clock past the valid window.
- **`src/modules/users/tests/factories.ts`** — `createUser` (passworded user), `userRepository` (passwordless user creation), `PLAIN_PASSWORD`.
- **`src/modules/users/repository.ts`** — `userRepository.create` is the direct repository call for the no-password fixture.
- **`src/modules/account/tests/factories.ts`** — `mintSession` issues a valid session (bearer + cookie) for a given user and `amr` set.
- **`src/modules/account/tests/contract/support.ts`** — `bearerIn` extracts the bearer from a re-mint response; `claimedAmr` decodes the `amr` claim of the re-minted token.
- **`src/modules/account/services/export.ts`** — `settleInlineExports` is awaited after a 202 to flush the background export so the test doesn't race.

## Notes

- The mailer adapter is **fully mocked**; `enqueueEmail` is a `jest.fn` that pushes into `mockOutbox`. No real transport is configured — `NODE_MAIL_TRANSPORT: 'outbox'` only tells the application *whether to offer* email, not how to send.
- `afterEach` restores real timers (`jest.useRealTimers()`), but there is **no matching `beforeEach`** that calls `jest.useFakeTimers()`; the fake-timer state is managed entirely by `freezeDate` / `advanceDate` from the clock support module.
- The "wrong code" tests use a two-value trick (`'000000' === mailedCode() ? '111111' : '000000'`) to guarantee a mismatch without hard-coding a code.
- The 5-attempt burn test is order-sensitive: it must run in the same "code already sent" context; it does **not** re-request a code.
- The file explicitly defers password-path session-cookie assertions to `api.contract.test.ts`; do not expect cookie-tier or double-mint-failure coverage here.
- `settleInlineExports` must be called (and awaited) after the 202 response in the stale-session export test, otherwise the background job may still be in flight when the test process tears down the DB.
