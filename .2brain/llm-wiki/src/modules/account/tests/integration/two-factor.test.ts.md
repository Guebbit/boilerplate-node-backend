---
source: src/modules/account/tests/integration/two-factor.test.ts
sha256: e53eabb163dfe35dc8a6b7411535e9103c9a71d0d1a751862bd30b567e76a8d7
generated_at: 2026-11-14T19:13:20.319961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose

Integration test suite that drives the real Express app through the full two-factor authentication lifecycle: enrolling TOTP and email-code factors, logging in via the two-step challenge, removing a factor, and disabling 2FA entirely. All routing, auth guards, and serialization run for real. The most critical assertion (not visible in the truncated portion) verifies that a challenge token alone cannot authenticate a request—a bypass would invalidate every other test.

## Key elements

- **`mockOutbox`** — Captures every email the app queues (template + data). The sole way to read a delivered code; the account stores only its HMAC. Named with the `mock*` prefix because `jest.mock` is hoisted and may only close over identifiers matching that prefix.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a stub that pushes into `mockOutbox` instead of sending.
- **`mailedCode()`** — Pulls the numeric code from the most recent `account.two-factor-code` mail entry.
- **`authenticateVerified()`** — Creates a user with `verifiedAt` set, logs in, returns `{ user, bearer }`. Used where the email factor requires a verified address.
- **`authenticateUnverified()`** — Same flow but without `verifiedAt`; the one place in the suite that opts out of the `authenticateAs` verified default.
- **`enrollTotp(bearer)`** — POSTs setup → confirm (using `codeFor`) → `forgetSessionEpoch`; returns `{ secret, backupCodes }`.
- **`enrollEmail(bearer, proof?)`** — POSTs setup (with optional `proof` code) → confirm with `mailedCode()` → `forgetSessionEpoch`; returns `{ backupCodes }`.
- **`startLogin(email)`** — Fires the password step of `POST /account/login`, which responds with a challenge rather than a token.
- **`mintChallenge(userId)`** — Loads the user's credentials via `userRepository` and calls `buildLoginChallenge` directly, producing a fresh DB-backed MFA challenge without an HTTP round-trip.
- **`describe('status')`** — Verifies `GET /account/2fa` shape: fresh account, unverified account, and armed-method reporting.
- **`describe('status while an enrollment is pending')`** — Confirms a setup that was never confirmed does not count as armed; a replace disarms the old factor before the new code is proved.
- **`describe('changing factors once one is armed')`** — First factor needs no proof; second factor and replaces require a valid code (422 otherwise) and do not disarm the existing factor on failure.
- *(Truncated section likely covers: login challenge flow with TOTP/email, bypass check, removal, and full disable.)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Imports `twoFactorService` (service-level assertions or setup). |
| `src/modules/account/services/two-factor-challenge.ts` | Imports `buildLoginChallenge` for the `mintChallenge` helper. |
| `src/modules/account/session/config.ts` | Imports `getExpiryTime` (likely to assert token/session TTLs). |
| `src/modules/account/tests/factories.ts` | Imports `plantToken` (session/challenge token helpers). |
| `src/modules/account/two-factor/index.ts` | Imports `DELIVERED_CODE_MAX_ATTEMPTS` (attempt-limit assertions). |
| `src/modules/users/tests/factories.ts` | Imports `userRepository`, `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`. |
| `src/types/index.ts` | Imports `RememberTier` (session type for token assertions). |
| `tests/support/http.ts` | Imports `api`, `authenticateAs` — the shared HTTP harness. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` to provision an isolated DB per run. |
| `tests/support/environment.ts` | Calls `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach`. |
| `tests/support/totp.ts` | Imports `codeFor` to generate valid TOTP codes for confirm steps. |
| `tests/support/session-epoch.ts` | Imports `forgetSessionEpoch` to clear server-side session state after mutations. |
| `tests/support/cookies.ts` | Imports `setCookie` (for cookie-based auth paths). |
| `tests/support/callers.ts` | Imports `testCallerContext` (caller identity for request context). |

## Notes

- **`mock*` naming is mandatory, not stylistic.** Jest hoists `jest.mock` calls above all imports; the factory closure may only reference identifiers starting with `mock` or `jest`. Renaming `mockOutbox` breaks the test at load time.
- **`forgetSessionEpoch` after every mutation.** Enrolling, confirming, and removing factors rotate the server-side session epoch. Without the call, a subsequent request with the same bearer token is rejected as stale, producing confusing 401s that look like an auth bug.
- **`authenticateAs` (from `tests/support/http.ts`) defaults to a verified account.** This suite defines its own `authenticateVerified` / `authenticateUnverified` to make the preconditions explicit and avoid depending on that default, which other suites may change.
- **`NODE_MAIL_TRANSPORT: 'outbox'` is set per test.** The suite's default environment uses `log` (discards mail). Only `outbox` retains the code in `mockOutbox`. Forgetting this `beforeEach` makes `mailedCode()` throw.
- **File is truncated.** The header comment references a bypass check "at the bottom" and the remaining test blocks (login challenge, removal, disable, password-change interplay via `REPLACEMENT_PASSWORD`) are not visible in the excerpt provided.
