---
source: src/modules/account/tests/integration/session-mint-guard.test.ts
sha256: 535513dedcb6013a5e547882549e3241b16b7fcdc898c9cc4adc4db078322328
generated_at: 2026-11-08T04:43:02.071114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-mint-guard.test.ts

## Purpose

Integration tests that verify the session-mint guard: `startSession` must refuse to mint a first session when the account has a second factor armed and the proof lacks a second-factor AMR, and must reject a proof whose timestamp predates the account's current session epoch. `continueSession` (re-mint) is exempt from the second-factor requirement. Each case also asserts the side-effect — that a refusal stores zero session rows and a success stores exactly one.

## Key elements

- **`armedUser()`** — local helper that calls `createUser` with `twoFactorEnabledAt` and a TOTP method, producing an account that has 2FA armed.
- **`sessionsOf(id)`** — returns the count of refresh-session rows for a user (wraps `sessionRowsOf`).
- **`CASES`** — readonly table of six scenarios spanning armed/unarmed × AMR combinations (`pwd`, `google`, `email`, `otp`) × mint kind (`start`/`continue`), each declaring the expected outcome (`minted: boolean`).
- **`describe('the mint guard, over proofs x armed x mint kind')`** — table-driven `it.each(CASES)` test; calls `startSession` or `continueSession`, expects `SecondFactorRequiredError` or success, then asserts row count.
- **`describe('the proof time')`** — two focused tests: (1) a stale `provedAt` triggers `StaleProofError` and stores nothing; (2) a successful mint stamps `auth_time` in the JWT payload as `Math.floor(provedAt / 1000)`.

## Relationships

- **`../../session/jwt.ts`** — source of `startSession` and `continueSession`, the two functions under test.
- **`../../session/mint-guard.ts`** — source of `SecondFactorRequiredError` and `StaleProofError`, the error classes asserted on.
- **`../factories.ts`** (`src/modules/account/tests/factories.ts`) — provides `sessionRowsOf`, used to verify side-effect row counts.
- **`@modules/users`** (`src/modules/users/index.ts`) — re-exports `userService`; the test calls `userService.bumpSessionEpoch` to advance the session epoch.
- **`@modules/users/tests/factories.ts`** — provides `createUser`, the primary fixture for both armed and unarmed accounts.
- **`@tests/setup-test-db`** — provides `setupTestDb`, called once at module scope to create a fresh in-memory database before any test runs.

## Notes

- `setupTestDb()` runs at module top level (not in `beforeAll`/`beforeEach`); every test in the file shares that one database instance.
- The `auth_time` assertion uses `jose`'s `decodeJwt` (unverified payload decode) — intentional, per the inline comment, because the test only reads back what the application itself signed.
- The table-driven pattern (`it.each` over a typed `CASES` array) is the project's convention for combinatorial test matrices; add new AMR or mint-kind combinations by extending `CASES` rather than writing a separate `it`.
- `continueSession` with an armed account and `pwd`-only AMR is expected to **succeed** — the guard applies only to first mints.
