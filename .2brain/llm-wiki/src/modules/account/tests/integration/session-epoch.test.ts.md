---
source: src/modules/account/tests/integration/session-epoch.test.ts
sha256: 823c57c09e18fbf49fd15666c1d75f5dbd75df0369e7c7861686fa0558273294
generated_at: 2026-11-14T19:11:07.199887+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-epoch.test.ts

## Purpose

Integration tests for the **session epoch** (`tokensValidAfter`): the guarantee that any access or refresh token minted before a "compromised" event is immediately refused, and that each qualifying event (password change, logout-all, 2FA arming, password reset, re-auth, email-change undo, credential change) advances the epoch. Uses a real clock — tests sleep ~1.1 s so the next token's whole-second `auth_time` lands after the epoch.

## Key elements

- **`PAST_THE_SECOND_MS` / `nextSecond()`** — sleep helper ensuring the next minted token is stamped in a later whole second than the current epoch.
- **`loginAs(email)`** — posts `/account/login`, returns `{ bearer, cookie }` for use in subsequent assertions.
- **`statusWith(bearer)`** — `GET /account` with a bearer token; returns the HTTP status (200 live / 401 dead).
- **`changedAccount()`** — creates a user whose email was changed to `new@example.com`, sets `previousEmail`, and plants an `email-change-undo` token.
- **`describe` blocks** — grouped by concern: pre-epoch refusal, events that move the epoch, email-change undo ordering, and credential-change writes that bump the epoch independently of `bumpSessionEpoch`.

## Relationships

- **`src/modules/users/friends/account.ts`** (`accountUserService`) — called directly for `bumpSessionEpoch` (to simulate a "compromised" event) and spied on `findAuthenticatableById` / `bumpSessionEpoch` to simulate datastore failures.
- **`src/modules/users/repository.ts`** (`userRepository`) — read via `findByIdWithCredentials` to assert the stored `tokensValidAfter`; written via `updateMany` to set `previousEmail`.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user fixtures.
- **`src/modules/account/tests/factories.ts`** — `plantToken`, `sessionRowsOf`, `tokenRowsOf` for seeding and asserting token/session rows.
- **`src/kernel/outbox.ts`** — `outboxEventModel` and `settleOutboxNudges` used to assert the `account.sessions_revoked` outbox event payload after email-change undo.
- **`tests/support/http.ts`** (`api`), **`tests/support/cookies.ts`** (`cookieHeader`), **`tests/support/environment.ts`** (`setEnvironment`), **`tests/support/setup-test-db.ts`** (`setupTestDb`), **`tests/support/totp.ts`** (`codeFor`) — standard test scaffolding for HTTP, cookie extraction, mail transport override, DB lifecycle, and TOTP code generation.

## Notes

- The test suite **relies on real time**: `nextSecond()` sleeps 1 100 ms so that whole-second `auth_time` comparisons are deterministic. Avoid replacing with fake timers without adjusting all `Date.now()` calls in assertions.
- The "older bump arriving late" test asserts **monotonicity**: `bumpSessionEpoch` must be a max-update, not a last-write-wins.
- In the "credential change moves the epoch in its own write" block, `bumpSessionEpoch` is mocked to **reject**, proving the credential endpoints call their own atomic write path rather than delegating to the shared bump helper.
- `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` runs in `beforeEach`; the outbox transport is required for the email-change undo test to capture `account.sessions_revoked` events without a real mail server.
