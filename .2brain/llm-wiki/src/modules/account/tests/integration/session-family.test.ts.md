---
source: src/modules/account/tests/integration/session-family.test.ts
sha256: 7920163dd5ebb62a327e6d69fb2e2b8ad612ec36a7f813b58bcbf44d8c188f56
generated_at: 2026-10-14T09:15:29.289296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-family.test.ts

## Purpose

Integration tests verifying that a session's logical identity (its `id`) remains stable across refresh-token rotation, and that token-reuse detection invalidates the entire session family. The module doc explains the failure mode being guarded against: if the id were taken from the individual token row, the first rotation would orphan it, causing "log out that device" to succeed silently while leaving the device signed in.

## Key elements

- **`loginAs(email)`** — Helper that POSTs to `/account/login` and returns the Bearer access token plus the `__Host-session` refresh cookie as a `Cookie` header value.
- **`refresh(cookie)`** — Helper that POSTs to `/account/refresh` with the given cookie.
- **`sessionIds(bearer)`** — Helper that GETs `/account/sessions` and returns the sorted array of session ids.
- **`describe("a session id across a refresh rotation")`** — Two tests: (1) the session id listed before and after a refresh is identical; (2) revoking a session by its id (read before rotation) still kills the device after it has rotated, while other sessions survive.
- **`describe("reuse detection with a session family")`** — Uses `startSession` and `rotateRefreshToken` directly (not via HTTP) to verify that replaying a superseded refresh token outside the grace window raises `TokenReuseError` and that the already-issued successor is also invalidated.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Imports `rotateRefreshToken`, `TokenReuseError`, and `startSession`; the reuse-detection test drives these functions directly to assert family-wide invalidation.
- **`src/modules/account/session/config.ts`** — Imports `RefreshTokenExpiryTime.SHORT` to parameterise `startSession`.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` and `PLAIN_PASSWORD` to provision a verified user for login.
- **`tests/support/clock.ts`** — Imports `freezeDate` / `advanceDate` to control time for the grace-window assertion.
- **`tests/support/cookies.ts`** — Imports `cookieHeader` to extract the `__Host-session` cookie from a response.
- **`tests/support/environment.ts`** — Imports `setEnvironment` (per-test mail transport override) and `withEnvironmentOverrides` (to set `NODE_TOKEN_ROTATION_GRACE_MS` / `NODE_TOKEN_REUSE_WINDOW_MS`).
- **`tests/support/http.ts`** — Imports `api` (supertest-style client) used by all HTTP helper functions and test steps.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` to prepare a clean database before the suite runs.

## Notes

- The reuse-detection test bypasses HTTP entirely and calls `rotateRefreshToken` / `startSession` at the unit level, but still requires a real DB row (set up via `setupTestDb`). It also depends on `withEnvironmentOverrides` to shrink the grace window so `advanceDate(5000)` lands outside it.
- `beforeEach` sets `NODE_MAIL_TRANSPORT: 'outbox'` globally for the file; the reuse test restores real timers in its own `afterEach` (the global `freezeDate` call inside `withEnvironmentOverrides` would otherwise leak).
- The "revoked after rotation" test creates a second login (`other`) to obtain a non-current session entry, then verifies that the id captured *before* `other` rotated still targets the correct device *after* rotation.
