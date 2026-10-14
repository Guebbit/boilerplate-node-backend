---
source: src/modules/account/tests/integration/email-change-lapse.test.ts
sha256: 27e5d6f25c454cc016a97e556f67948b03ad7481196fda735bed9f6c721a8a33
generated_at: 2026-10-14T09:09:13.389548+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-lapse.test.ts

## Purpose

Integration tests for the nightly sweep `reapLapsedPreviousEmails`, which clears a user's `previousEmail` once the email-change undo token has expired or no longer exists. The suite verifies the exact boundary: the account is cleared *only* when it holds a previous address **and** has no live `email-change-undo` token.

## Key elements

- **`setupTestDb()`** — top-level call that prepares a fresh test database before any test runs.
- **`UNDO`** — constant set to the literal string `'email-change-undo'`; intentionally hard-coded (not imported from a shared constant) so a rename of the token type fails this suite loudly.
- **`changedAccount(username, undoTtlMs?)`** — helper that creates a user, sets `previousEmail` via `userRepository.updateMany`, and optionally plants an `UNDO`-type token with the given TTL. A *negative* TTL simulates an already-expired token; `undefined` means no token is planted at all.
- **`previousEmailOf(id)`** — reads the user back and returns the stored `previousEmail` (or `undefined` if cleared).
- **`describe('reapLapsedPreviousEmails')`** — five test cases covering:
  1. Clears `previousEmail` when the undo token is expired (negative TTL).
  2. Clears it when no undo token exists at all.
  3. **Keeps** it while the undo token is still live (positive TTL), asserting the sweep returns `0`.
  4. Not fooled by a live token of a *different* type (`'email-change'` vs `'email-change-undo'`)—still clears.
  5. Leaves `email` and `pendingEmail` untouched when a pending change is in flight.

## Relationships

- **`src/modules/account/services/index.ts`** — re-exports `reapLapsedPreviousEmails`, the function under test.
- **`src/modules/account/services/previous-email-cleanup.ts`** — the implementation module that the services barrel re-exports from.
- **`src/modules/account/tests/factories.ts`** — provides `plantToken`, used to create verification tokens with a specific type and TTL.
- **`src/modules/users/repository.ts`** — the `userRepository` used for `updateMany` (setting/clearing `previousEmail`, `pendingEmail`) and `findByIdWithCredentials` (reading back).
- **`src/modules/users/tests/factories.ts`** — provides `createUser` and re-exports `userRepository` for test setup.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for database initialization.

## Notes

- The `UNDO` constant is deliberately **not** imported from a shared types module; it is inlined so that a rename of the token-type string causes a test failure rather than silently testing the wrong token type.
- A negative `ttlMs` passed to `plantToken` is the convention in this codebase for simulating an already-expired token; `undefined` skips token creation entirely.
- The test that checks a different token type (`'email-change'`) still allows cleanup—only the exact `email-change-undo` type acts as a "live undo" guard.
