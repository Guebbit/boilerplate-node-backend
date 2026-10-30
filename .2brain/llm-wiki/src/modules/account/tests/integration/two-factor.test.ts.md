---
source: src/modules/account/tests/integration/two-factor.test.ts
sha256: 15967a9537e2dc5417cbafe2595ac0fc986ef83bfd7e1cd342da54528dbd478e
generated_at: 2026-10-29T03:03:14.724089+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose

Integration test suite for two-factor authentication (TOTP and delivered email codes), driven through the real Express app so routing, guards, and serialization all execute. Covers enrollment, pending-enrollment status, login challenge flow, factor replacement, removal, and disabling. The file's own doc comment calls the bypass test (a challenge token must not authenticate a request on its own) the single most important assertion in the suite.

## Key elements

- **`mockOutbox`** — Array that captures every queued email. The mailer is `jest.mock`'d so `enqueueEmail` pushes into this instead of sending. Named `mock*` because Jest hoisting only permits closing over identifiers with that prefix.
- **`mailedCode()`** — Returns the 6-digit code from the most recent `account.two-factor-code` mail in the outbox.
- **`mailsOf(template)`** — Filters the outbox by template; used to assert no mail was sent.
- **`authenticateVerified()` / `authenticateUnverified()`** — Create a user and perform a real login, returning `{ user, bearer }`. The pair exists because `authenticateAs` defaults to a verified account; these make the verification state explicit.
- **`enrollTotp(bearer)`** — Full TOTP setup + confirm round-trip; returns the secret and backup codes. Calls `forgetSessionEpoch` afterward.
- **`enrollEmail(bearer, proof?)`** — Full email-code setup + confirm; reads the code from the outbox. Accepts an optional `proof` code (from an already-armed factor) required for a second method.
- **`startLogin(email)`** — POSTs `/account/login` with the shared plain password; returns the challenge response (not a full token).
- **`mintChallenge(userId)`** — Calls `twoFactorService.buildLoginChallenge` directly to produce a fresh, DB-backed challenge without a login round-trip.
- **`describe('status')`** — Asserts the `/account/2fa` response shape for fresh, partially-enrolled, and pending states.
- **`describe('status while an enrollment is pending')`** — Confirms a method that was set up but never confirmed does not appear as armed.
- **`describe('changing factors once one is armed')`** — Verifies code-required rules for adding a second method or replacing an existing one; asserts the armed factor stays armed on refusal.
- *(Truncated: further suites cover the login challenge flow, factor removal, disabling, and the bypass test.)*

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper around the real Express app) and `authenticateAs`; every HTTP call in the suite goes through this.
- **`tests/support/totp.ts`** — Provides `codeFor(secret, window)` to generate a valid TOTP code for the confirm step.
- **`tests/support/environment.ts`** — `setEnvironment` is called in `beforeEach` to force `NODE_MAIL_TRANSPORT: 'outbox'` so delivered codes land in the mock outbox rather than being dropped.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` prepares a clean database before the suite runs.
- **`tests/support/session-epoch.ts`** — `forgetSessionEpoch` invalidates the server-side epoch cache after an enrollment mutates the factor list.
- **`tests/support/cookies.ts`** — `setCookie` is imported for cookie-based session handling (likely used in the truncated portion).
- **`tests/support/callers.ts`** — `testCallerContext` supplies a caller identity for requests that need one.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user fixtures; `userRepository.findByIdWithCredentials` is used by `mintChallenge`.
- **`src/modules/account/services/index.ts`** — Exports `twoFactorService`, used only by `mintChallenge` to build a challenge at the service level.
- **`src/modules/account/two-factor/index.ts`** — Exports `DELIVERED_CODE_MAX_ATTEMPTS`, likely consumed in a truncated test that exercises attempt-limiting.
- **`src/modules/account/session/config.ts`** — Exports `getExpiryTime`, imported for TTL-related assertions (usage in the truncated portion).
- **`src/modules/account/tests/factories.ts`** — Exports `plantToken`, likely used to pre-seed a challenge token in the bypass test.
- **`src/types/index.ts`** — Exports `RememberTier`, imported for typing (usage in the truncated portion).

## Notes

- **`mock*` naming is not cosmetic.** Jest hoists `jest.mock` above all imports; the factory closure may only reference module-scope identifiers that start with `mock`. Renaming `mockOutbox` would break the test.
- **Two `beforeEach` blocks.** The first sets the mail transport to `outbox`; the second clears the outbox. Both run before every test. Order matters only in that clearing must happen after the transport is set (or it doesn't matter functionally, but the split documents intent).
- **`forgetSessionEpoch` after every enrollment.** Enrolling or replacing a factor bumps the session epoch on the server; without calling this helper, a subsequent request in the same test would carry a stale epoch and be rejected.
- **The file is truncated in the source provided.** The doc comment references a bypass test ("if a challenge token can authenticate a request on its own, nothing else here is worth anything") and the `DELIVERED_CODE_MAX_ATTEMPTS` / `getExpiryTime` / `RememberTier` / `plantToken` imports are all used in the unseen remainder.
