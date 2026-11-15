---
source: src/modules/account/tests/integration/two-factor-concurrency.test.ts
sha256: f7016cd203d99b065c364032d16aa75588d5bf6f9f0f0127c8bba836b80a35ae
generated_at: 2026-11-14T19:12:59.565091+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor-concurrency.test.ts

## Purpose

Integration tests that verify one-time-use two-factor secrets (backup codes, emailed login codes, step-up codes) are spent exactly once and that wrong-guess counters hold regardless of request interleaving. Every test fires parallel HTTP requests through the real app (supertest) and asserts invariants that must hold under **any** scheduling order, not just the one where a single request happens to win.

## Key elements

- **`mockOutbox`** – Module-level array that captures every email the app queues. The mailer adapter is replaced via `jest.mock` so `enqueueEmail` pushes into this array instead of sending.
- **`mailedCode(template)`** – Reads the newest entry in `mockOutbox` for a given template and returns its `data.code` string.
- **`confirmEmail(bearer, code)`** – Helper for `POST /account/2fa/methods/email/confirm`.
- **`signedIn()`** – Creates a user with a verified email, logs in via the API, returns `{ user, bearer }`.
- **`armedAccount()`** – Builds on `signedIn()`; sets up and confirms a TOTP factor, returning the backup-code set from the confirm response.
- **`challengeFor(userId)`** – Mints a fresh login challenge at the service level (one per racing request) using `buildLoginChallenge`.
- **`loginWith(userId, code)`** – `POST /account/login/2fa` with a freshly-minted challenge and a backup code.
- **`storedCodes(userId)`** – Reads the current `twoFactorBackupCodes` array from the repository.
- **`oauthOnlySession()`** – Creates a password-less user and starts a session tagged `['google']`, returning a bearer token.
- **`reauthWith(bearer, code)`** – `POST /account/reauth` with an emailed step-up code.
- **`describe` blocks** – Four groups: backup-code spend, mailed 2FA code, step-up code, and first backup-code-set generation under parallel factor confirmation.

## Relationships

- **`src/modules/account/two-factor/index.ts`** – Re-exports `hashBackupCode` and `DELIVERED_CODE_MAX_ATTEMPTS`, both used to verify stored digests and to size the wrong-guess ceiling tests.
- **`src/modules/account/services/two-factor-challenge.ts`** – `buildLoginChallenge` is called directly (service-level) to mint a unique challenge per parallel `loginWith` call.
- **`src/modules/account/services/index.ts`** – Source of the `twoFactorService` import; used to enqueue a login code for the mailed-code tests.
- **`src/modules/account/session/jwt.ts`** – `startSession` + `createAccessToken` build the OAuth-only bearer token used in the step-up and reauth tests.
- **`src/modules/users/repository.ts`** – `userRepository` is read (not written) after each parallel burst to inspect stored backup-code digests, count, and account version.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` bootstrap accounts; `userRepository` is the same repository instance.
- **`src/infrastructure/persistence/versioning.ts`** – `versionOf` extracts the optimistic-concurrency version to assert it is unchanged after code send/spend.
- **`tests/support/http.ts`** – `api()` provides the supertest agent for all HTTP calls.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database at module load.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_MAIL_TRANSPORT` to `'outbox'` so the app routes mail through the mocked adapter.
- **`tests/support/session-epoch.ts`** – `forgetSessionEpoch` invalidates the session-epoch binding after factor confirmation so subsequent logins aren't blocked.
- **`tests/support/totp.ts`** – `codeFor(secret, counter)` generates a valid TOTP code for confirming the TOTP factor.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity required when enqueuing a login code.

## Notes

- `mockOutbox` **must** carry the `mock` prefix: `jest.mock` hoisting only allows closing over variables with that prefix.
- The mailer mock is applied at module scope (`jest.mock` at top level), not inside a `describe` block, so every test in this file uses it.
- `challengeFor` is deliberately called **inside** each parallel `loginWith` so every racing request gets its own challenge; reusing one challenge across requests would change what is being tested.
- The ceiling tests fire `DELIVERED_CODE_MAX_ATTEMPTS + 3` wrong guesses concurrently, then assert the *correct* code is still rejected (422) — proving the counter is not reset by interleaving.
- `findLast` (ES 2023) is used to grab the most recent queued mail; ensure the runtime/target supports it.
- The "two factors confirmed in parallel" test asserts that exactly one of the two confirm responses carries a backup-code set (the one that stored it), and that the handed-out codes hash to the stored digests — the other response returns an empty set.
