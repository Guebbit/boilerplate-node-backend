---
source: tests/integration/concurrency/auth-races.test.ts
sha256: 95d21d4274e0d2698bab4f4e8771c18e22fd2fefe26925d62e8d0e7cd5e8216f
generated_at: 2026-09-27T15:55:06.590479+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration test suite that fires N genuinely-concurrent HTTP requests (via supertest) at the account endpoints to verify race-condition invariants: exactly one account per email, no token loss under concurrent login, and correct refresh-token rotation under simultaneous exchange. It asserts *properties* (counts, distinctness, no 5xx) rather than *orderings* (which request won), because the winner is the database's business.

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — Fires `RACE_SIZE` parallel `POST /account/signup` calls for one email. Asserts: exactly 1 document in DB, exactly one 201 + N−1 409s, the survivor can log in, and the serial (non-racy) path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — Fires parallel `POST /account/login` calls. Asserts: all N logins return 200, the stored `tokens` array has length N (no clobbered write), all tokens are distinct, and concurrent `logout-all` removes every refresh token (the `$pull` half of the read-modify-write guard).
- **`describe('R5 — concurrent refresh-token rotation, same cookie')`** — Fires parallel `GET /account/refresh` calls with the *same* JWT cookie. Asserts: all N get 200, each receives a distinct new cookie, and exactly one superseded ancestor exists (the original, claimed atomically once).
- **`describe('one-time tokens under contention')`** — Fires 2 parallel reset-confirm requests with the same one-time token; asserts exactly one succeeds and the other is rejected (not 500).
- **`issueSession()`** — Local helper that creates a user, logs in, and extracts the `jwt` cookie for reuse in R5 tests.

## Relationships

- **`tests/support/race.ts`** — Supplies `raceN`, `RACE_SIZE`, `countStatus`, and `expectNoServerErrors`. All concurrency driving and status-tallying goes through this helper rather than raw `Promise.all`.
- **`tests/support/http.ts`** — Exports `api()`, the supertest-wrapped request builder used for every HTTP call in the file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to wipe/reset the test MongoDB before the suite runs.
- **`tests/support/rate-limit-harness.ts`** — Exports `withReloadedRateLimits`, imported (and likely used in the truncated tail) to reset rate-limit state between assertions so 429s don't interfere.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` (seed a document), `PLAIN_PASSWORD` / `REPLACEMENT_PASSWORD` (known password pairs), and `userRepository` (direct DB access for post-race assertions).
- **`src/modules/users/index.ts`** — Barrel import for `hashToken` and `TokenType` enum used in test setup.
- **`src/modules/users/model.ts`** — Imported directly (not via barrel) for `userModel.countDocuments` assertions. The file comment notes specs may reach the model; runtime code may not.
- **`src/modules/users/repository.ts`** — The production code under test: `tokenSupersede` (R5's atomic claim), `findOneWithCredentials` (reading stored tokens after a race), and the `$push`/`$pull` write pattern that R4 guards.

## Notes

- **Assert invariants, not winners.** The suite never checks *which* request got the 201 or the first rotation slot. Only counts, distinctness, and absence of 5xx matter.
- **Both guards are load-bearing for R1's 409 split.** `unique: true` on the index produces the E11000; `databaseErrorInterpreter` maps it to 409. Remove either and the status distribution breaks (multiple 201s, or 500s).
- **`userModel` is imported from `model.ts` directly**, not the barrel, because the barrel intentionally omits it. This is a sanctioned exception for test specs.
- **`Promise.allSettled` is used (via `raceN`), not `Promise.all`.** A single rejecting request must not cancel the assertion over the whole batch.
- **`--runInBand` does not affect intra-test concurrency.** The N in-flight requests are created within a single `it` block; Jest's worker model is irrelevant here.
- **429 is explicitly asserted against** (`expectNoServerErrors`), because a rate-limiter firing mid-race would mask the actual invariant being tested.
- **Hit-rate data is recorded in the file header** (N=10, 20 runs) to guard against the suite silently degrading to a non-racing test. If a future change makes the race untriggerable, the green tests would be vacuous.
