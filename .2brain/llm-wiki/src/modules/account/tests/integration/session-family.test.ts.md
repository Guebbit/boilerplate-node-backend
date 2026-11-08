---
source: src/modules/account/tests/integration/session-family.test.ts
sha256: 1b3b4a50f571afaffc39917d2d6e503dd904c6fe89b453c24538999824eabd3b
generated_at: 2026-11-08T04:42:48.463276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-family.test.ts

## Purpose

Integration tests verifying that a session maintains a single stable identifier across refresh-token rotation, and that token-reuse detection revokes the entire session family (all past and future token rows), not just the replayed token. The header comment explains the failure mode this guards against: if the "id" were taken from the current token row, "log out that device" would target a dead predecessor and silently fail to sign the device out.

## Key elements

- **`loginAs(email)`** — Posts `/account/login`; returns `{ bearer, cookie }` for the resulting session.
- **`refresh(cookie)`** — Posts `/account/refresh` with the given `__Host-session` cookie; returns the response carrying the next cookie.
- **`sessionIds(bearer)`** — Fetches `GET /account/sessions` and returns the sorted array of session IDs.
- **`describe('a session id across a refresh rotation')`** — Two tests: (1) the ID list is identical before and after a refresh; (2) a non-current device's ID, captured before rotation, still revokes that device correctly (204) while the caller's own session is untouched (200).
- **`describe('reuse detection with a session family')`** — One test using `startSession` + `rotateRefreshToken` directly: replays the superseded token outside the grace window, expects `TokenReuseError`, then confirms the *successor* token is also revoked.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Imports `startSession`, `rotateRefreshToken`, and `TokenReuseError` for the reuse-detection test (drives the rotation logic in-process rather than via HTTP).
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` and `PLAIN_PASSWORD` for provisioning test accounts.
- **`src/types/index.ts`** — Source of the `RememberTier` enum used when calling `startSession`.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` control the clock so the grace-window expiry is deterministic.
- **`tests/support/cookies.ts`** — `cookieHeader` extracts the `__Host-session` cookie value from a response.
- **`tests/support/environment.ts`** — `setEnvironment` (per-test mail transport) and `withEnvironmentOverrides` (per-test token-rotation / reuse-window knobs).
- **`tests/support/http.ts`** — `api()` returns a configured Supertest agent for all HTTP calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory database before the suite runs.

## Notes

- The reuse-detection test sets `NODE_TOKEN_ROTATION_GRACE_MS` to 1000 ms and `NODE_TOKEN_REUSE_WINDOW_MS` to 600 000 ms, then advances the clock 5000 ms to fall outside the grace window. Forgetting these overrides would make the replayed token still valid.
- `freeezeDate` (via `freezeDate`) swaps in fake timers; the `afterEach(() => jest.useRealTimers())` in that block restores real timers so other tests aren't affected.
- The "still logs the device out" test deliberately reads the target ID from *one* device's session list, then rotates a *different* device, to prove the ID is not tied to the token row that happened to be current at read time.
