---
source: src/modules/account/tests/integration/two-factor-concurrency.test.ts
sha256: ee3c15026774885069880745462d1573c1f51b572fe076f1dddf7282156b733a
generated_at: 2026-11-08T04:44:39.344698+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor-concurrency.test.ts

## Purpose

Integration test that exercises one-time 2FA credentials (backup codes, mailed login codes, step-up codes) under **parallel** HTTP requests against the real app. Every assertion is written to hold under *any* request interleaving — the file exists to catch race conditions where a one-time secret could be spent twice, an attempt counter could miss a failure, or a backup-code set could be double-written.

## Key elements

- **`mockOutbox`** – in-memory array that captures every queued email; the only place a delivered code is available in the clear.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – replaces `enqueueEmail` with a recorder; all other mailer exports are kept via `jest.requireActual`.
- **`mailedCode(template)`** – pulls the latest queued mail of a given template and returns its `data.code`.
- **`signedIn()`** – creates a verified user, logs in, returns `{ user, bearer }`.
- **`armedAccount()`** – extends `signedIn()` by arming the TOTP factor and returns the initial `backupCodes` array.
- **`challengeFor(userId)`** – mints a fresh login challenge at the `twoFactorService` level (one per racing request).
- **`loginWith(userId, code)`** – `POST /account/login/2fa` with a per-request challenge and a backup code.
- **`storedCodes(userId)`** – reads the hashed backup-code set straight from `userRepository`.
- **`oauthOnlySession()`** – creates a passwordless user, opens a session via `startSession` + `createAccessToken` to simulate an OAuth login.
- **`reauthWith(bearer, code)`** – `POST /account/reauth` with the emailed step-up code.
- **Four `describe` blocks**:
  1. *Backup code, spent in parallel* – same code twice, two different codes, login racing regeneration.
  2. *Mailed 2FA code, in parallel* – same code twice; wrong-guess ceiling under parallel misses.
  3. *Step-up code, in parallel* – same code twice; wrong-guess ceiling; account version stability.
  4. *First backup-code set, two factors confirmed in parallel* – exactly one set stored; every code handed out is valid.

## Relationships

| Neighbor | How it's used |
|---|---|
| `tests/support/http.ts` | `api()` – supertest-style helper for all HTTP calls. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` – one-time real-DB bootstrap. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach`. |
| `tests/support/totp.ts` | `codeFor(secret, step)` – generates a valid TOTP code for confirmation. |
| `tests/support/session-epoch.ts` | `forgetSessionEpoch(bearer)` – resets the session-epoch guard between steps. |
| `tests/support/callers.ts` | `testCallerContext` – passed to `twoFactorService.sendLoginCode`. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD` – seed test accounts. |
| `src/modules/users/repository.ts` | `userRepository` – direct reads/writes of stored codes, version, and user records. |
| `src/modules/account/services/index.ts` | `twoFactorService.buildLoginChallenge` / `.sendLoginCode` – service-level operations bypassing the HTTP layer. |
| `src/modules/account/two-factor/index.ts` | `DELIVERED_CODE_MAX_ATTEMPTS`, `hashBackupCode` – constants and hashing used in assertions. |
| `src/modules/account/session/jwt.ts` | `startSession`, `createAccessToken` – build the OAuth-only bearer token. |
| `src/infrastructure/persistence/versioning.ts` | `versionOf(user)` – asserts the account row version is unchanged by 2FA code ops. |

## Notes

- **`mockOutbox` naming** is required by Jest's `jest.mock` hoisting rule (only variables prefixed `mock` may be closed over).
- The file deliberately does **not** assert on a specific request winning the race; it asserts on aggregate invariants (exactly one 200, exact remaining code count, exact stored set), so the tests pass under every interleaving.
- The "first backup-code set" test is the trickiest: it confirms that when TOTP and email are confirmed concurrently, only **one** backup-code set is persisted, and the codes handed out by the *other* (non-storing) response are still valid against the stored salt — catching a lost-update or duplicate-insert bug.
- `versionOf` is checked only in the step-up suite; the other suites don't assert version stability, meaning a regression there would surface only in that specific test.
