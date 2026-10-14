---
source: src/modules/account/tests/integration/two-factor.test.ts
sha256: c875a20e66c51f402aaac1196ee95cbe612619e331f6d0889add60dbf34bbce9
generated_at: 2026-10-14T14:43:58.268027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose

End-to-end integration tests for the two-factor authentication lifecycle: enrolling a device (TOTP) factor and a delivered (email) factor, logging in through the two-step challenge with either, removing one factor, and disabling the rest. All requests go through the real Express app so routing, guards, and serialization run for real. The file's own header calls out a bypass-check test (challenge token authenticating on its own) as the single most important assertion in the suite.

## Key elements

- **`mockOutbox`** – Array that captures every `enqueueEmail` call (template + data). The sole way to read a delivered code, which exists in the clear only in the message body. Named with the `mock` prefix because `jest.mock` is hoisted above imports and may only close over identifiers with that prefix.
- **`mailedCode()`** – Returns the numeric code from the most recent `account.two-factor-code` mail in the outbox.
- **`authenticateVerified()`** – Creates a user with `verifiedAt` set, logs in via `POST /account/login`, and returns `{ user, bearer }`.
- **`authenticateUnverified()`** – Same flow but the user has no `verifiedAt`; used for the two cases that exercise the unverified-address state.
- **`enrollTotp(bearer)`** – Calls `/account/2fa/methods/totp/setup` then `/confirm` with a code from `codeFor(secret, 0)`. Returns `{ secret, backupCodes }`. Calls `forgetSessionEpoch` afterwards.
- **`enrollEmail(bearer, proof?)`** – Calls `/account/2fa/methods/email/setup` (passing `proof` code if a second factor is required) then `/confirm` with the code from `mailedCode()`. Returns `{ backupCodes }`.
- **`startLogin(email)`** – Fire-and-forget password step; used when the suite only needs the challenge half of login.
- **`mintChallenge(userId)`** – Service-level helper: loads the user's credentials and calls `twoFactorService.buildLoginChallenge` to produce a fresh DB-backed MFA challenge token without an HTTP round-trip.
- **`mailsOf(template)`** – Filters `mockOutbox` to a specific template, oldest first.
- **`describe('status', …)`** – Verifies the `GET /account/2fa` response shape: unauthenticated → 401, fresh account → both methods available, unverified address → email not enrollable with a reason string, armed method moves from `available` to `methods`.
- **`describe('status while an enrollment is pending', …)`** – A setup that is never confirmed does not count as armed; a replace (new setup with a backup code) disarms the factor before the new code is proved.
- **`describe('changing factors once one is armed', …)`** – First factor needs no code; a second method or a replace without a code returns 422 and the existing factor stays armed.
- *(File is truncated in the provided excerpt; the remaining suites cover the two-step login challenge, factor removal, full disable, and the bypass-check test.)*

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper over the real Express app) and `authenticateAs` (used implicitly via the login flow; this file calls `api()` directly for most requests).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module level to provision a per-test-database.
- **`tests/support/environment.ts`** – `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach` so the mailer mock actually queues instead of dropping.
- **`tests/support/totp.ts`** – `codeFor(secret, offset)` generates a valid TOTP code at a given time step for the confirm step.
- **`tests/support/session-epoch.ts`** – `forgetSessionEpoch(bearer)` resets the server-side epoch check after an enrollment/confirmation that invalidates the session.
- **`tests/support/cookies.ts`** – `setCookie` is imported (used in the truncated portion for cookie-based session handling).
- **`tests/support/callers.ts`** – `testCallerContext` provides a standardized caller identity for service-level calls.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user fixtures; `userRepository` for direct DB lookups in `mintChallenge`.
- **`src/modules/account/services/index.ts`** – `twoFactorService.buildLoginChallenge` is called directly in `mintChallenge`.
- **`src/modules/account/two-factor/index.ts`** – `DELIVERED_CODE_MAX_ATTEMPTS` is imported (used in the truncated portion for retry-exhaustion tests).
- **`src/modules/account/session/config.ts`** – `getExpiryTime`, `RefreshTokenExpiryTime` imported (likely used in the truncated portion for token-expiry assertions).
- **`src/modules/account/tests/factories.ts`** – `plantToken` imported (used in the truncated portion to seed a token directly in the DB).

## Notes

- The `mockOutbox` identifier **must** start with `mock` because `jest.mock` hoisting only permits closing over variables with that prefix. Renaming it will cause a runtime `ReferenceError`.
- `NODE_MAIL_TRANSPORT: 'outbox'` is set in a `beforeEach` so every test gets a clean outbox; the default `log` transport would silently discard codes.
- `authenticateAs` (from `tests/support/http.ts`) defaults to a **verified** account. This file therefore provides its own `authenticateVerified` / `authenticateUnverified` helpers to make the requirement explicit rather than relying on that default.
- After every enrollment/confirmation helper the suite calls `forgetSessionEpoch(bearer)` because those actions bump the session epoch server-side; without it, the next request with the same bearer token would be rejected.
- The file's own doc comment flags the **bypass-check test** (not visible in the truncated excerpt) as the single most important assertion: a challenge token must never authenticate a request on its own.
