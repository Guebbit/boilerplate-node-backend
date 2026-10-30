---
source: src/modules/account/tests/integration/session-epoch.test.ts
sha256: 08049a1d6aede8107c50870eea7e040c480ca7e35de4b465e35169720e2978d7
generated_at: 2026-10-29T03:00:58.806525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-epoch.test.ts

## Purpose

Integration tests for the **session epoch** (`tokensValidAfter`): the mechanism by which a user's "I may be compromised" events invalidate every previously minted access token and refresh cookie. The suite verifies that tokens stamped in an earlier whole second are refused after a bump, that each privileged action (password change, logout-all, 2FA arming, password reset, re-auth, email-change undo) moves the epoch correctly, and that failure paths (datastore outage, bump rejection) behave as specified.

## Key elements

- **`loginAs(email)`** – performs `POST /account/login`, returns `{ bearer, cookie }` for use in subsequent requests.
- **`statusWith(bearer)`** – shorthand for `GET /account` with a Bearer header; returns the HTTP status (200 = live, 401 = revoked).
- **`nextSecond()`** – sleeps 1 100 ms so the *next* token's `auth_time` falls in a later whole second than the previous one (real-clock strategy).
- **`changedAccount()`** – creates a user with `previousEmail` set and a planted `email-change-undo` one-time token.
- **`PAST_THE_SECOND_MS` (1 100)** – the minimum delay used both by `nextSecond` and as the "future" epoch value in direct `bumpSessionEpoch` calls.
- **Test suites:**
  - *a token minted before the epoch* – refusal of access + refresh; monotonic bump (late older bump is a no-op).
  - *the events that move the epoch* – password change, logout-all (success + failure), plain logout (no epoch move), 2FA arming, password reset (purges tokens *and* sessions), re-auth (retires old refresh cookie).
  - *"this wasn't me"…* – email-change undo revokes sessions even when address restore 409s; asserts the outbox `account.sessions-revoked` event carries `reason: 'email-change-undo'`.
  - *a credential change moves the epoch in its own write* – mocks `bumpSessionEpoch` to reject, verifying the flow still completes (truncated in listing).

## Relationships

- **`@tests/http` → `api()`** – every HTTP call goes through this helper (supertest wrapper).
- **`@tests/setup-test-db` → `setupTestDb()`** – initialises and tears down the test database once per run.
- **`@tests/environment` → `setEnvironment`** – sets `NODE_MAIL_TRANSPORT: 'outbox'` so no real SMTP is attempted.
- **`@tests/totp` → `codeFor`** – generates a TOTP code for the 2FA-arming test.
- **`@tests/cookies` → `cookieHeader`** – extracts the `__Host-session` cookie value from a response into a `Cookie` header string.
- **`@modules/users` → `userService`** – called directly in tests to invoke `bumpSessionEpoch` and to mock `findAuthenticatableById` for the failure-path test.
- **`@kernel/outbox` → `outboxEventModel`, `settleOutboxNudges`** – used to flush pending outbox writes and then assert on the emitted `account.sessions-revoked` event.
- **`@modules/users/tests/factories`** – provides `createUser`, `userRepository`, and the well-known `PLAIN_PASSWORD` / `REPLACEMENT_PASSWORD` constants.
- **`../factories` (account test factories)** – `plantToken`, `sessionRowsOf`, `tokenRowsOf` for inspecting/manipulating one-time token and session rows directly in the DB.

## Notes

- **Real clock, whole-second granularity.** Both `auth_time` (token claim) and `tokensValidAfter` are compared in *whole* seconds. The 1 100 ms sleep guarantees the next minted token lands in a strictly later second. There is no `jest.useFakeTimers` in this file.
- **Monotonic bump.** The "older bump arriving late" test asserts that a second, earlier-timestamped `bumpSessionEpoch` call does *not* lower the stored epoch—the later value wins.
- **Failure-path mocking.** The logout-all failure test mocks `userService.findAuthenticatableById` with `mockImplementationOnce` / `mockRejectedValueOnce` to simulate a datastore read failing *after* the route guard has already read the user. Restore all mocks in `afterEach`.
- **`settleOutboxNudges()`** must be awaited before querying `outboxEventModel`; the outbox flush is asynchronous and not tied to the HTTP response lifecycle.
- The file is truncated in the listing; the final suite ("credential change moves the epoch in its own write") contains at least an email-change-confirm case that verifies the epoch bump is performed in the same write as the credential update, independent of the service-level `bumpSessionEpoch` call.
