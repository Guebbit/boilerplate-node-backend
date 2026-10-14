---
source: src/modules/account/tests/integration/two-factor-concurrency.test.ts
sha256: 9e9580945a7be61b8fd5dfca1385dbbf7a75d7b3dcccb085bd92636d77a69aab
generated_at: 2026-10-14T14:43:23.958464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor-concurrency.test.ts

## Purpose

Integration tests that verify one-time-use 2FA credentials (backup codes, mailed login codes, step-up codes) are spent exactly once and that attempt counters are correct **under every possible interleaving** of parallel requests. The tests exercise the real HTTP surface (`/account/login/2fa`, `/account/reauth`, `/account/2fa/methods/*/confirm`) with concurrent `Promise.all` calls to catch races that single-request tests cannot.

## Key elements

- **`mockOutbox`** – Array that captures every `enqueueEmail` call (the mailer adapter is `jest.mock`-ed). Only place a delivered code exists in the clear.
- **`mailedCode(template)`** – Extracts the `code` digit-string from the newest queued mail of a given template.
- **`signedIn()`** – Creates a verified user, logs in via the API, returns `{ user, bearer }`.
- **`armedAccount()`** – Builds on `signedIn`; sets up TOTP, confirms it, returns `{ user, bearer, backupCodes }`.
- **`challengeFor(userId)`** – Mints a fresh login challenge through `twoFactorService.buildLoginChallenge` (one per racing request).
- **`loginWith(userId, code)`** – `POST /account/login/2fa` with a backup code on its own challenge.
- **`storedCodes(userId)`** – Reads the hashed backup-code digests directly from `userRepository`.
- **`oauthOnlySession()`** – Creates a password-less user and starts a `['google']` session, mimicking an OAuth login.
- **`reauthWith(bearer, code)`** – `POST /account/reauth` with the step-up email code.
- **Test suites:**
  - *Backup code, spent in parallel* – duplicate spend, distinct spend, login-vs-regeneration race.
  - *Mailed 2FA code, in parallel* – duplicate spend, attempt-ceiling under concurrent wrong guesses.
  - *Step-up code, in parallel* – duplicate spend, attempt ceiling, and version-stability assertion.
  - *First backup-code set, parallel factor confirm* – TOTP + email confirmed concurrently; asserts a single stored set and that every handed-out code matches.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | All HTTP calls go through the `api()` helper. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions a clean test database before the suite. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_MAIL_TRANSPORT` to `'outbox'` so mail is captured, not sent. |
| `tests/support/totp.ts` | `codeFor(secret, counter)` generates valid TOTP codes for confirm steps. |
| `tests/support/session-epoch.ts` | `forgetSessionEpoch` invalidates cached session state after 2FA setup, forcing a fresh challenge. |
| `tests/support/callers.ts` | `testCallerContext` supplies the caller identity for service-level calls (`sendLoginCode`). |
| `modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD`, and `userRepository` for direct DB setup/reads. |
| `modules/account/services/index.ts` | `twoFactorService.buildLoginChallenge` and `sendLoginCode` used to mint challenges and dispatch codes at the service level. |
| `modules/account/session/jwt.ts` | `startSession` + `createAccessToken` build the OAuth-only bearer token. |
| `modules/account/two-factor/index.ts` | `DELIVERED_CODE_MAX_ATTEMPTS` (attempt ceiling) and `hashBackupCode` (digest helper for assertions). |
| `infrastructure/persistence/versioning.ts` | `versionOf` read from the entity to assert the account version is **unchanged** after sending/spending a step-up code. |

## Notes

- **`mockOutbox` naming is mandatory.** `jest.mock` is hoisted above imports; it may only close over variables whose names start with `mock`/`Mock`. Renaming the array will break the mock factory at runtime.
- **Every racing request gets its own challenge.** `challengeFor` mints a fresh challenge per request so the test isolates credential-spend races from challenge-reuse races.
- **Attempt-ceiling tests fire `MAX + 3` parallel wrong guesses**, then assert the subsequently correct code returns `422`. This proves the counter is incremented on *every* miss regardless of interleaving, not just on the winning request.
- **The regeneration race test** (login vs. backup-code regeneration) asserts the stored digests are *exactly* the newly generated set—no stale codes survive, no codes are duplicated.
- **The parallel-confirm test** (TOTP + email) asserts only **one** backup-code set is stored and that every code handed out by either response hashes into that set, catching a "two sets overwrite each other" race.
