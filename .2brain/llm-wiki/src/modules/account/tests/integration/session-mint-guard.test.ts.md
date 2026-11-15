---
source: src/modules/account/tests/integration/session-mint-guard.test.ts
sha256: 47c4f2a710e30474459e902104c301872589f96e4e27e36d1539117a107fecc5
generated_at: 2026-11-14T19:11:26.025193+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-mint-guard.test.ts

## Purpose

Integration test that pins the two guarantees of the session-mint backstop: a first session (`startSession`) is refused unless the proof satisfies the account's armed second factor, and any proof whose timestamp predates the account's current session epoch is rejected. It also verifies that `auth_time` is stamped in NumericDate seconds from the caller-supplied proof time.

## Key elements

- **`armedUser()`** – creates a test user with `twoFactorEnabledAt` set and a TOTP method enrolled, producing an "armed" account fixture.
- **`sessionsOf(id)`** – counts refresh-session rows for an account via `sessionRowsOf`, used to assert that a refusal stores nothing while a mint stores exactly one row.
- **`CASES`** – table-driven matrix (6 rows) crossing `armed` × `amr` claims × mint kind (`start`/`continue`) with expected mint/refuse outcome.
- **`describe('the mint guard, over proofs x armed x mint kind')`** – iterates `CASES` with `it.each`, calls `startSession` or `continueSession`, classifies the result as `'minted'` / `'refused'` / `'other'`, and asserts the DB row count.
- **`describe('the proof time')`** – two cases: (1) bumps the session epoch *after* the proof timestamp and expects `StaleProofError` with zero rows stored; (2) mints a session with a past `provedAt` and asserts `decodeJwt(token).auth_time === Math.floor(provedAt / 1000)`.

## Relationships

- **`src/modules/account/session/jwt.ts`** – source of `startSession` and `continueSession`, the functions under test.
- **`src/modules/account/session/mint-guard.ts`** – source of `SecondFactorRequiredError` and `StaleProofError`; the guard logic the test exercises indirectly through the jwt functions.
- **`src/modules/account/tests/factories.ts`** – provides `sessionRowsOf` for DB-row assertions.
- **`src/modules/users/friends/account.ts`** – exports `accountUserService`; the test calls `accountUserService.bumpSessionEpoch` to invalidate a proof's timestamp.
- **`src/modules/users/tests/factories.ts`** – provides `createUser` for constructing test accounts (both armed and unarmed).
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb` called at module top level to seed a real database for the integration run.

## Notes

- This is an **integration** test (real DB, real JWT signing), not a unit test; `setupTestDb()` runs at import time, so the DB must be available before the suite loads.
- The `decodeJwt` call is used purely to read back the signed payload without verification—the test does not validate the signature, only the `auth_time` claim value.
- The `'other'` outcome branch in the matrix test exists to surface unexpected error types (e.g., a bug that throws something other than `SecondFactorRequiredError`) rather than silently passing.
