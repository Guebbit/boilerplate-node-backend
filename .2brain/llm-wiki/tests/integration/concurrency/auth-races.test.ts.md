---
source: tests/integration/concurrency/auth-races.test.ts
sha256: 318596a31fe99d14aae79fcc3d123e858a0ac49f9115bc582156732db36f9fce
generated_at: 2026-09-23T20:03:35.818039+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration tests that fire N genuinely concurrent HTTP requests at the account endpoints (signup, login, refresh, reset) and assert **invariants** (exactly one user exists, all tokens survive, distinct token values) rather than request orderings. They exist as regression guards for three real bugs (R1, R4) and one explicit design guarantee (R5: refresh-token rotation under same-instant contention must not look like theft).

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — Races `POST /account/signup` with the same email. Asserts exactly one document, exactly one 201 + N−1 409s, the survivor can log in, and the serial (non-raced) duplicate path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — Races `POST /account/login`. Asserts all N tokens are stored, all N values are distinct (no clobbering write), and `logout-all` under contention removes every refresh token of that type.
- **`issueSession`** (local helper) — Creates a user, logs in, and returns the user plus the `jwt=` cookie for use in R5 tests.
- **`describe('R5 — concurrent refresh-token rotation, same cookie')`** — Races `GET /account/refresh` with the _same_ cookie. Asserts every racer gets a 200, each receives a distinct new refresh token, and exactly one ancestor entry is marked `supersededAt`.
- **`describe('one-time tokens under contention')`** — Races two simultaneous reset-confirm requests; asserts exactly one succeeds and the other is rejected (not 500). _(Content truncated in source.)_

## Relationships

- **`tests/support/race.ts`** — Provides `raceN` (Promise.allSettled-based concurrent dispatch), `RACE_SIZE` (the N constant), `countStatus`, and `expectNoServerErrors`. All assertions in this file depend on these helpers.
- **`tests/support/http.ts`** — Provides the `api()` supertest instance used for every HTTP call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top to reset the test database before any `describe` block runs.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` is imported (likely to clear rate-limit state between runs so 429s don't pollute the race results).
- **`src/modules/users/tests/factories.ts`** — Source of `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and the `userRepository` handle used for post-race DB assertions.
- **`src/modules/users/index.ts`** — Barrel export for `hashToken` and `TokenType` (runtime-safe re-exports).
- **`src/modules/users/model.ts`** — `userModel` is imported directly (bypassing the barrel) solely for `countDocuments` assertions in R1; the file's own comment notes this is permitted for specs but not for runtime code.
- **`src/modules/users/repository.ts`** — Not imported directly here, but the R5 tests exercise `tokenSupersede` (defined there) through the HTTP surface; the docblock explicitly names it as the atomic-claim implementation under test.

## Notes

- **`userModel` is imported from the model file, not the barrel.** The in-file comment flags this as a deliberate exception: a spec may reach the model directly; runtime code must not.
- **Assertions are invariant-based, not ordering-based.** Which request "wins" is non-deterministic; only the final state (count = 1, all tokens present, distinct values) is asserted. Do not rewrite tests to expect a specific request to succeed.
- **`raceN` uses `Promise.allSettled`, not `Promise.all`**, so a single 500 or 409 doesn't abort the batch. See `tests/support/race.ts` for the rationale.
- **429 must never appear.** `expectNoServerErrors` asserts against it; the rate-limit harness is imported to ensure clean state. A 429 in results means the race never actually raced.
- **R5 is a design proof, not a bug fix.** `tokenSupersede` in the repository is the unit under test; this file verifies its guarantee under real concurrency with N participants presenting the _same_ cookie.
- The file docblock records observed hit rates (20/20 contended runs) as evidence the tests actually race. If a test goes green with zero 409s or zero lost tokens across many runs, suspect the harness before the code.
