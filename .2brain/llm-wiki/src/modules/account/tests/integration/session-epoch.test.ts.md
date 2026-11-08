---
source: src/modules/account/tests/integration/session-epoch.test.ts
sha256: 1787bf823d4650ec883e8221c43dfaa4f5df0d2258554ef2d6d54af8318a3f69
generated_at: 2026-11-08T04:42:35.843363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-epoch.test.ts

## Purpose

Integration tests for the **session epoch** (`tokensValidAfter`) mechanism. Verifies that a token minted before an epoch bump is refused as both an access token and a refresh token, and that each "I may be compromised" event (password change, logout-all, 2FA arming, password reset, email-change undo, reauth) correctly advances the epoch and invalidates prior sessions while leaving the actor's re-minted session working.

## Key elements

- **`PAST_THE_SECOND_MS` / `nextSecond()`** — 1100 ms sleep so the next JWT's `auth_time` lands in a later whole-second bucket than prior tokens; required because both the claim and the epoch compare in whole seconds.
- **`loginAs(email)`** — POSTs `/account/login`, returns `{ bearer, cookie }` for use across test steps.
- **`statusWith(bearer)`** — `GET /account` with a bearer; returns the HTTP status (200 = live, 401 = refused).
- **`changedAccount()`** — Creates a user whose email was changed away from `old@example.com` and plants a live `email-change-undo` token.
- **`describe('a token minted before the epoch')`** — Three tests: access-token refusal, refresh-token refusal, and idempotency (an older bump arriving late does not undo a newer one).
- **`describe('the events that move the epoch')`** — Seven tests covering password change, logout-all (including a 500-on-failure path), plain logout (no bump), 2FA arm, password-reset-confirm (purges one-time tokens *and* sessions), and reauth (retires the old refresh token).
- **`describe('"this wasn\'t me" …')`** — Two tests for email-change undo: 409-conflict still kills old sessions, and the `account.sessions_revoked` outbox event carries the correct reason.
- **`describe('a credential change moves the epoch in its own write')`** — Mocks `bumpSessionEpoch` to reject, then verifies the endpoint still ends sessions (email-change confirm, truncated in source).

## Relationships

- **`tests/support/http.ts`** (`api`) — All HTTP calls go through the supertest wrapper.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — Boots an isolated MongoDB per test run.
- **`tests/support/environment.ts`** (`setEnvironment`) — Sets `NODE_MAIL_TRANSPORT: 'outbox'` in `beforeEach`.
- **`tests/support/cookies.ts`** (`cookieHeader`) — Extracts the `__Host-session` cookie from a response.
- **`tests/support/totp.ts`** (`codeFor`) — Generates a TOTP code for the 2FA-confirm test.
- **`src/modules/users/index.ts`** (`userService`) — Called directly to bump the epoch (`bumpSessionEpoch`) and spied on for failure-path tests.
- **`src/modules/users/tests/factories.ts`** (`createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`) — User creation and direct DB assertions.
- **`src/modules/users/repository.ts`** (`userRepository`) — Read via factory re-export to inspect `tokensValidAfter`, and `updateMany` to set `previousEmail`.
- **`src/kernel/outbox.ts`** (`outboxEventModel`, `settleOutboxNudges`) — Asserts the `account.sessions_revoked` outbox row after email-change undo.
- **`src/modules/account/tests/factories.ts`** (`plantToken`, `sessionRowsOf`, `tokenRowsOf`) — Plants one-time tokens for the password-reset and email-change-undo scenarios; inspects session/token rows for assertions.

## Notes

- **Real clock, not fake timers.** The file deliberately avoids `jest.useFakeTimers`; it sleeps 1100 ms (`nextSecond()`) so the JWT's `auth_time` (whole seconds) is guaranteed to be before an epoch set "now." Any test that needs "before the bump" must call `nextSecond()` first.
- **The caller's own old token also dies.** In the password-change test, the caller's *pre-change* bearer is 401; only the *re-minted* token from the response body is valid. Do not assume the acting session survives the epoch bump.
- **Failure-path mock pattern.** The "datastore down" test mocks `findAuthenticatableById` to succeed once (guard read) then reject (service read), simulating a mid-request DB failure. The `bumpSessionEpoch` mock in the credential-change block rejects outright to prove the endpoint does not silently skip the bump.
- **Outbox is async.** `settleOutboxNudges()` must be awaited before querying `outboxEventModel`; otherwise the assertion races the worker.
