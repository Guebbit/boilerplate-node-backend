---
source: src/modules/account/tests/integration/session-mint-guard.test.ts
sha256: d958a28e0a9e4815710b1dd91bae1707173a02eef754dc57878c5dde7c13d3b4
generated_at: 2026-10-14T09:15:45.199631+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-mint-guard.test.ts

## Purpose

Integration test for the mint-guard backstop: it verifies that `startSession` rejects an account with an armed second factor unless the AMR proof includes a second-factor method, and that `continueSession` does not impose that restriction. It also asserts the DB side-effect — a refusal stores zero rows, a successful mint stores exactly one.

## Key elements

- **`armedUser()`** — local factory that creates a user with `twoFactorEnabledAt` set and a TOTP entry in `twoFactorMethods`.
- **`sessionsOf(id)`** — counts refresh-session rows for a given user ID (wraps `sessionRowsOf`).
- **`CASES`** — table-driven matrix (6 rows) of `{ armed, amr, mint, minted }` covering the armed/unarmed × password/federated/mailed/OTP × start/continue space.
- **`describe('the mint guard, …')` / `it.each(CASES)`** — the single test block that drives every case, asserting either a resolved session or a rejection of type `SecondFactorRequiredError`, then checking the row count.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/session/jwt.ts` | Under test — `startSession` and `continueSession` are the two mints exercised. |
| `src/modules/account/session/mint-guard.ts` | Provides `SecondFactorRequiredError`, the expected rejection type. |
| `src/modules/account/tests/factories.ts` | Provides `sessionRowsOf`, the DB query used by `sessionsOf`. |
| `src/modules/users/tests/factories.ts` | Provides `createUser`, used for both armed and unarmed fixtures. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is invoked at module scope to prepare the in-memory DB. |

## Notes

- The "continue" row (`armed, re-mint on password alone`) documents the key semantic split: `continueSession` deliberately skips the guard because the session was already validated at start.
- `setupTestDb()` runs at import time (top-level), not inside a `beforeAll` hook — a project-wide convention for integration tests.
- Adding a new AMR scenario is a one-line addition to `CASES`; no new test function is needed.
