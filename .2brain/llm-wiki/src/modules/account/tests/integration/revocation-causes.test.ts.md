---
source: src/modules/account/tests/integration/revocation-causes.test.ts
sha256: d590be88701fcbdc224d27a477d213486ae7beb241e64feb3023d0c0250223bf
generated_at: 2026-10-14T09:13:23.009274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/revocation-causes.test.ts

## Purpose

Integration test that drives every revocation cause through its real HTTP (or session-rotation) door against a live database, then asserts the three observable side-effects the cause's row in the `REVOCATION` table promises: victim sessions are dead, pending tokens are purged (or kept), and the outbox announcement was (or wasn't) written. The `Record<RevocationCause, Trigger>` map makes the suite exhaustive—adding a new cause to the domain table without a trigger here is a compile error.

## Key elements

- **`TRIGGERS: Record<RevocationCause, Trigger>`** — Exhaustive map from each cause string to a builder that returns a `Scenario`. The `describe.each` loop iterates over `Object.keys(REVOCATION)`, so every cause gets exactly one test case.
- **`Trigger` / `Scenario`** — A `Trigger` is `() => Promise<Scenario>`; a `Scenario` carries `userId`, a `victim` bearer token from a second device, and a `fire()` that hits the real endpoint.
- **`accountWithVictim(email)`** — Creates a verified user, plants a `verify`-type pending token, and logs in a "victim" device. All triggers start from this fixture.
- **Individual trigger builders** (`viaPasswordChange`, `viaPasswordReset`, `viaLogoutAll`, `viaEmailConfirm`, `viaEmailUndo`, `viaTwoFactorConfirm`, `viaRefreshReuse`) — Each sets up its pre-conditions (planted tokens, pending email, 2FA secret, stolen session) and returns the `fire` call that hits the real endpoint or session function.
- **`viaRefreshReuse`** — The only trigger that does not call an HTTP endpoint; it calls `startSession` + `rotateRefreshToken` directly and expects a `TokenReuseError` as the "fire" event.
- **`works(bearer)`** — Thin check that `GET /account` still returns 200 with the given bearer.
- **`loginAs(email)`** — POSTs `/account/login` and returns `{ bearer, cookie }`.
- **The single `it` block** — After `fire()` + `settleOutboxNudges()`, asserts: victim token is dead, caller session count matches `row.callerKeeps`, `verify` token presence matches `!row.pending`, and outbox payload matches `row.announce`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — Source of the `REVOCATION` table and `RevocationCause` type. The test reads each row's `callerKeeps`, `pending`, and `announce` flags as its expected values; the `Record<RevocationCause, Trigger>` type enforces one trigger per cause.
- **`src/modules/account/session/jwt.ts`** — Provides `startSession`, `rotateRefreshToken`, and `TokenReuseError` used exclusively by the `viaRefreshReuse` trigger to simulate a stolen-token replay.
- **`src/modules/account/tests/factories.ts`** — Supplies `plantToken` (to seed pending verify/password/email tokens), `sessionRowsOf` (to count live sessions), and `tokenTypesOf` (to check which token types remain).
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `PLAIN_PASSWORD`, and `REPLACEMENT_PASSWORD` used by every trigger.
- **`src/modules/users/repository.ts`** — `userRepository.updateMany` is called directly in `viaEmailConfirm` and `viaEmailUndo` to set `pendingEmail` / `previousEmail` before planting the confirm/undo token.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to verify the `account.sessions-revoked` event; `settleOutboxNudges` is awaited before assertions.
- **`tests/support/http.ts`** — `api()` is the supertest-style client used for every HTTP call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to provision a fresh database.
- **`tests/support/environment.ts`** — `setEnvironment` in `beforeEach` configures `NODE_MAIL_TRANSPORT: 'outbox'`, a 1 ms token-rotation grace, and a 600 s reuse window.
- **`tests/support/cookies.ts`** — `cookieHeader` extracts the `__Host-session` cookie from the login response.
- **`tests/support/totp.ts`** — `codeFor` generates a valid TOTP code for the two-factor-change trigger.

## Notes

- **Exhaustiveness is compile-time.** The `Record<RevocationCause, Trigger>` type means a new key in `REVOCATION` breaks the build until a trigger is added—there is no runtime "missing case" guard needed.
- **`PAST_THE_SECOND_MS = 1100`** is slept *before* `fire()` so that tokens already minted fall before the epoch the cause stamps, ensuring the "kill sessions after epoch T" logic actually catches them.
- **`settleOutboxNudges()`** must be awaited after `fire()` and before the outbox query; skipping it makes the announcement assertion flaky.
- **The single `it` block is shared across all causes.** Each cause's row in `REVOCATION` is the sole source of expected values—there are no per-cause hardcoded expectations, so the table *is* the spec.
- **`viaRefreshReuse` expects a rejection** (`TokenReuseError`) as part of `fire()`, not a successful response. The `expect(...).rejects` inside the trigger means a non-rejection would fail the test setup rather than the assertion.
