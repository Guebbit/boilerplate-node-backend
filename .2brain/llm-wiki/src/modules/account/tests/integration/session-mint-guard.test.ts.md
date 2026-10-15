---
source: src/modules/account/tests/integration/session-mint-guard.test.ts
sha256: 535513dedcb6013a5e547882549e3241b16b7fcdc898c9cc4adc4db078322328
generated_at: 2026-10-15T10:13:30.290054+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-mint-guard.test.ts

## Purpose

Integration test for the session-mint backstop: it verifies that issuing a **first** session (`startSession`) is refused when the account has a second factor armed and the proof lacks the required method, that a re-mint (`continueSession`) is exempt, and that a proof whose `provedAt` predates the account's current session epoch is rejected. It exists to pin down the guard that catches any future mint call site which forgets its own pre-check.

## Key elements

- **`armedUser()`** – local factory that creates a user with `twoFactorEnabledAt` set and one enrolled TOTP method.
- **`sessionsOf(id)`** – counts refresh-session rows in the test DB for a given user id.
- **`CASES`** – read-only table of six (armed × AMR × mint-kind) combinations with the expected `minted` outcome, consumed by `it.each`.
- **`describe('the mint guard, over proofs x armed x mint kind')`** – table-driven test that calls `startSession` or `continueSession`, asserts the correct error type (`SecondFactorRequiredError`) or success, and confirms the DB row count (0 vs 1).
- **`describe('the proof time')`** – two tests: (1) a stale `provedAt` triggers `StaleProofError` and stores no row; (2) `startSession` stamps `auth_time` (NumericDate seconds) on the signed JWT.

## Relationships

- **`src/modules/account/session/jwt.ts`** – under test; provides `startSession` and `continueSession`.
- **`src/modules/account/session/mint-guard.ts`** – provides the error types `SecondFactorRequiredError` and `StaleProofError` that the assertions match against.
- **`src/modules/account/tests/factories.ts`** – provides `sessionRowsOf`, used to inspect persisted session rows.
- **`src/modules/users/tests/factories.ts`** – provides `createUser`, the base user factory.
- **`src/modules/users/index.ts`** – re-exports `userService`; the test calls `userService.bumpSessionEpoch` to advance the session epoch.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb`, called at module scope to prepare the integration test database.

## Notes

- `decodeJwt` from `jose` is used **without verification** solely to read the `auth_time` claim back from the token the app itself signed; it is not a security assertion.
- The "continue" (re-mint) path deliberately skips the second-factor requirement — that exemption is a tested, intentional design decision, not an oversight.
- `setupTestDb()` runs at import time (module top-level), not inside a `beforeAll` hook.
