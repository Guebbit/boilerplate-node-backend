---
source: src/modules/account/tests/integration/session-epoch.test.ts
sha256: 33ccf193aa6277c16729649b1aeb3401ac3e88c96bc2704e808c89c686e9e037
generated_at: 2026-10-14T14:41:21.655450+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-epoch.test.ts

## Purpose

Integration tests for the **session epoch** (`tokensValidAfter`) mechanism: once the epoch advances, every access token and refresh token minted before that instant is refused, regardless of how the epoch moved (password change, logout-all, 2FA arming, password reset, re-authentication, email-change-undo, etc.). The tests run against a real HTTP stack and a real clock, using short sleeps to guarantee whole-second separation between token mints and the epoch bump.

## Key elements

- **`loginAs(email)`** — posts `/account/login` and returns a `{ bearer, cookie }` pair for subsequent requests.
- **`statusWith(bearer)`** — issues `GET /account` with a bearer token; resolves to the HTTP status (200 live, 401 expired).
- **`nextSecond()`** — sleeps ~1 100 ms so the next token's `auth_time` falls in a later whole second than any prior token.
- **`changedAccount()`** — creates a user whose email was changed, sets `previousEmail`, and plants an `email-change-undo` token; returns the user.
- **`describe("a token minted before the epoch")`** — verifies access-token and refresh-token refusal after `bumpSessionEpoch`, and that a later (older) bump does not undo a newer one.
- **`describe("the events that move the epoch")`** — covers password change, logout-all (success, failure, plain logout), 2FA arming, password reset (token/challenge purge), and re-authentication.
- **`describe('"this wasn\'t me" …')`** — email-change-undo: session revocation fires even on a 409 conflict; outbox event `account.sessions-revoked` carries `reason: 'email-change-undo'`.
- **`describe("a credential change moves the epoch in its own write")`** — mocks `bumpSessionEpoch` to reject, proving the endpoint's own write path is the epoch mover (partial — file is truncated).

## Relationships

- **`@tests/http`** (`api`) — all HTTP calls in the file go through this supertest-style wrapper.
- **`@tests/setup-test-db`** (`setupTestDb`) — provisions a fresh database before the suite.
- **`@tests/environment`** (`setEnvironment`) — sets `NODE_MAIL_TRANSPORT: 'outbox'` so no real mail is sent.
- **`@tests/cookies`** (`cookieHeader`) — extracts the `__Host-session` cookie from a response into a `Cookie` header string.
- **`@tests/totp`** (`codeFor`) — generates a valid TOTP code for the 2FA-arming test.
- **`@modules/users`** (`userService`) — calls `bumpSessionEpoch` and `findAuthenticatableById` (the latter spied in the logout-all failure test).
- **`@kernel/outbox`** (`outboxEventModel`, `settleOutboxNudges`) — queries the outbox collection to assert the `account.sessions-revoked` event and flushes pending nudges.
- **`@modules/users/tests/factories`** (`createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`) — user fixtures and direct repository reads (`findByIdWithCredentials`, `updateMany`).
- **`../factories`** (`plantToken`, `sessionRowsOf`, `tokenRowsOf`) — low-level helpers to insert token rows and inspect session/token collections after a test action.

## Notes

- The whole suite relies on **real wall-clock time**. The `PAST_THE_SECOND_MS` constant (1 100 ms) exists because `auth_time` and `tokensValidAfter` are compared in **whole seconds**; any test that needs "before the bump" must sleep past that boundary.
- `loginAs` is called **twice** in multi-device tests to obtain two independent sessions; the first call's token is always "the other device."
- The logout-all failure test spies on `userService.findAuthenticatableById` with `mockImplementationOnce` / `mockRejectedValueOnce` to simulate a datastore outage *after* the guard's own read succeeds — ordering matters.
- The `email-change-undo` 409 test pre-creates a **second** user claiming the old address to trigger the conflict, verifying that session revocation still happens before the address restore fails.
- `settleOutboxNudges()` must be awaited before querying `outboxEventModel`, or the event may not yet be persisted.
