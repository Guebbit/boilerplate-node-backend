---
source: src/modules/account/tests/integration/session-family.test.ts
sha256: 1b3b4a50f571afaffc39917d2d6e503dd904c6fe89b453c24538999824eabd3b
generated_at: 2026-10-29T03:01:11.476563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-family.test.ts

## Purpose

Integration tests that verify a session's identity (its `id`) remains stable across refresh-token rotation, and that replaying a superseded token revokes the entire token family (including the successor). These tests guard against a specific regression: if the id were derived from the token row, it would go stale on the first rotation, causing "log out that device" to silently succeed while leaving the device signed in.

## Key elements

- **`loginAs(email)`** – POSTs `/account/login`, returns the access token as a `Bearer` string and the `__Host-session` cookie as a `Cookie` header value.
- **`refresh(cookie)`** – POSTs `/account/refresh` with the given cookie; returns the raw response.
- **`sessionIds(bearer)`** – GETs `/account/sessions`, extracts and sorts the `id` fields.
- **`describe('a session id across a refresh rotation')`** – Two tests:
  - *id before/after rotation*: asserts the id set is identical after a refresh.
  - *revocation after rotation*: reads the target session's id **before** the other device rotates, then revokes it **after**; asserts the revoked device's next refresh gets 401 while the other device still refreshes with 200.
- **`describe('reuse detection with a session family')`** – One test that calls `startSession` → `rotateRefreshToken` directly (no HTTP), advances the fake clock past the grace window, and asserts both the superseded token and its successor are rejected (the second via a generic throw, confirming family-wide revocation).

## Relationships

- **`src/modules/account/session/jwt.ts`** – Imports `startSession`, `rotateRefreshToken`, and `TokenReuseError` for the family-revocation test; the HTTP-based tests in the same file exercise the same logic indirectly through the API.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` and `PLAIN_PASSWORD` for test fixtures.
- **`src/types/index.ts`** – Imports `RememberTier` (used as the tier argument to `startSession`).
- **`tests/support/http.ts`** – `api()` builds the supertest-style HTTP client for all endpoint calls.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots an isolated database before the suite.
- **`tests/support/environment.ts`** – `setEnvironment` and `withEnvironmentOverrides` configure env vars (mail transport, grace/reuse windows).
- **`tests/support/cookies.ts`** – `cookieHeader` extracts the `__Host-session` cookie from a response.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` control time in the reuse-detection test.

## Notes

- The critical assertion is in the *revocation after rotation* test: the id is captured **before** the other device rotates. If the implementation keyed on the token row id, that id would be dead by the time the `DELETE` fires, and the 204 → 401 chain would not hold.
- The reuse-detection test bypasses HTTP entirely and calls `rotateRefreshToken` twice; the second call on the **successor** is expected to throw (not a `TokenReuseError`), confirming the whole family is revoked rather than just the replayed token.
- Environment overrides (`NODE_TOKEN_ROTATION_GRACE_MS: '1000'`, `NODE_TOKEN_REUSE_WINDOW_MS: '600000'`) are scoped to the `withEnvironmentOverrides` callback and restored afterward; fake timers are reset in `afterEach`.
