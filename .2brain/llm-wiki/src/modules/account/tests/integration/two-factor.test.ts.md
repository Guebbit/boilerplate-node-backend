---
source: src/modules/account/tests/integration/two-factor.test.ts
sha256: 15967a9537e2dc5417cbafe2595ac0fc986ef83bfd7e1cd342da54528dbd478e
generated_at: 2026-11-08T04:44:58.323774+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose

End-to-end integration test for the two-factor authentication feature (TOTP device factor and email code factor). Drives the real Express app so routing, auth guards, and serialization all execute for real. Covers the full lifecycle—enroll, confirm, status, replace, remove, disable—and the login challenge flow. The file's own comment flags one test as the most critical: verifying that a challenge token alone cannot authenticate a request (bypass check).

## Key elements

- **`mockOutbox`** — in-memory array that captures every email the app queues. The only way to read a delivered two-factor code, since the account stores only an HMAC. Named `mock*` because `jest.mock` hoisting requires that prefix.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — replaces `enqueueEmail` with a spy that pushes into `mockOutbox` and resolves immediately. Nothing is actually sent.
- **`setupTestDb()`** — initialises the test database before any test runs.
- **`mailedCode()`** — pulls the digits from the most recent `account.two-factor-code` mail in the outbox.
- **`authenticateVerified()`** — creates a verified user and logs in, returning `{ user, bearer }`. States the verified-email requirement explicitly rather than relying on `authenticateAs`'s default.
- **`authenticateUnverified()`** — same, but the address is *not* verified; used for the two tests that exercise that state.
- **`enrollTotp(bearer)`** — runs the TOTP setup → confirm flow, returns `{ secret, backupCodes }`. Calls `forgetSessionEpoch` afterward.
- **`enrollEmail(bearer, proof?)`** — runs the email setup → confirm flow, reading the code from `mockOutbox`. Accepts an optional proof code from an already-armed factor.
- **`startLogin(email)`** — POSTs to `/account/login` (password step only); expects a challenge response, not a token.
- **`mintChallenge(userId)`** — mints a fresh DB-backed MFA challenge at the service level via `twoFactorService.buildLoginChallenge`, avoiding an extra HTTP round-trip.
- **`mailsOf(template)`** — filters `mockOutbox` by template, oldest first.
- **`describe('status')`** — asserts shape of `GET /account/2fa` on fresh, unverified, and partially-armed accounts.
- **`describe('status while an enrollment is pending')`** — asserts that a setup-without-confirm leaves the method out of `methods` and back in `available`; also covers the "replace disarms before re-proof" case for both email and TOTP.
- **`describe('changing factors once one is armed')`** — covers first-factor (no code needed), second-factor refusal, replace refusal, and wrong-code refusal.
- Remaining describes (truncated) cover the login challenge flow, backup-code redemption, removal, disabling, and the final bypass check.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (supertest wrapper over the real Express app) and `authenticateAs`; the entire suite is driven through these.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database once.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_MAIL_TRANSPORT: 'outbox'` in every `beforeEach` so the mailer path is the outbox (not `log`).
- **`tests/support/totp.ts`** — `codeFor(secret, counter)` generates a valid TOTP code for confirmation.
- **`tests/support/cookies.ts`** — `setCookie` (used for session/cookie manipulation in login flows).
- **`tests/support/session-epoch.ts`** — `forgetSessionEpoch(bearer)` invalidates the session epoch after factor changes so subsequent requests see the new state.
- **`tests/support/callers.ts`** — `testCallerContext` provides caller context for request simulation.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for seeding test users.
- **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` used by `mintChallenge` to load the user with credentials.
- **`src/modules/account/services/index.ts`** — `twoFactorService` used by `mintChallenge` and any service-level assertions.
- **`src/modules/account/two-factor/index.ts`** — `DELIVERED_CODE_MAX_ATTEMPTS` constant for attempt-limit assertions.
- **`src/modules/account/session/config.ts`** — `getExpiryTime` for token-expiry assertions.
- **`src/modules/account/tests/factories.ts`** — `plantToken` for seeding challenge/session tokens directly in the DB.
- **`src/types/index.ts`** — `RememberTier` type for remember-me assertions.

## Notes

- The `jest.mock` for the mailer is **hoisted above imports**, which is why the outbox array must be named with the `mock` prefix. Renaming it breaks the mock.
- `beforeEach` sets `NODE_MAIL_TRANSPORT: 'outbox'` — the suite's default (`log`) would silently drop the delivered code, making `mailedCode()` throw.
- `authenticateVerified` / `authenticateUnverified` exist because `authenticateAs` defaults to a verified account; the unverified path is only exercised in two specific tests, and opting out is done here rather than mutating the shared helper.
- After every enroll/confirm helper, `forgetSessionEpoch` is called. Omitting it causes subsequent requests to hit a stale session epoch and fail with an unrelated auth error.
- The `mintChallenge` helper bypasses HTTP entirely to get a fresh challenge per call; prefer it over `startLogin` when a test needs multiple distinct challenges without extra round-trips.
- The file is truncated in the snapshot; the "bypass check" test referenced in the header comment is expected near the end.
