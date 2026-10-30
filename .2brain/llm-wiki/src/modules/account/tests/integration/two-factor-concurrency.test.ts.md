---
source: src/modules/account/tests/integration/two-factor-concurrency.test.ts
sha256: ee3c15026774885069880745462d1573c1f51b572fe076f1dddf7282156b733a
generated_at: 2026-10-29T03:02:51.726826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor-concurrency.test.ts

## Purpose

Integration tests that verify two-factor one-time secrets—backup codes, mailed login codes, and step-up reauth codes—are consumed exactly once when identical or competing requests arrive in parallel. Every assertion must hold under any interleaving; a test that passes only because one request happened to win first is considered meaningless.

## Key elements

- **`mockOutbox`** — In-memory array capturing every `enqueueEmail` call; the sole place a mailed code is visible in the clear. Must carry the `mock` prefix because `jest.mock` hoisting only allows closing over that naming convention.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a stub that records the envelope into `mockOutbox` instead of sending mail.
- **`mailedCode(template)`** — Returns the `code` field from the newest queued mail matching the given template; throws if none was sent.
- **`signedIn()`** — Creates a verified-email user, performs `/account/login`, and returns `{ user, bearer }`.
- **`armedAccount()`** — Extends `signedIn()` by setting up and confirming TOTP; returns the user, bearer, and the `backupCodes` array handed out at confirm time.
- **`challengeFor(userId)`** — Calls `twoFactorService.buildLoginChallenge` directly to mint a fresh per-request challenge, isolating the race to code-spending logic.
- **`loginWith(userId, code)`** — `POST /account/login/2fa` with a freshly minted challenge and the given code.
- **`storedCodes(userId)`** — Reads `twoFactorBackupCodes` digests straight from the repository for post-race assertions.
- **`oauthOnlySession()`** — Creates a passwordless user and mints a JWT via `startSession`/`createAccessToken`, simulating an OAuth login.
- **`reauthWith(bearer, code)`** — `POST /account/reauth` with the emailed step-up code.
- **Test suites (four `describe` blocks):**
  - *Backup code, spent in parallel* — duplicate spend, two distinct codes, and login racing regeneration.
  - *Mailed 2FA code, in parallel* — duplicate spend and wrong-guess ceiling under concurrency.
  - *Step-up code, in parallel* — duplicate spend, wrong-guess ceiling, and that sending/spending a code does not bump the account version.
  - *First backup-code set, two factors confirmed in parallel* — exactly one set is stored; the union of codes handed out in both responses matches the stored set.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | `api` is the HTTP client used by every route call in the file. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises a clean database for the suite. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` restricts mail delivery to the mock. |
| `tests/support/totp.ts` | `codeFor(secret, counter)` generates a valid TOTP code for the confirm step. |
| `tests/support/session-epoch.ts` | `forgetSessionEpoch(bearer)` invalidates the session between setup and racing phases. |
| `tests/support/callers.ts` | `testCallerContext` supplies the caller identity when invoking `twoFactorService.sendLoginCode` directly. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD`, and `userRepository` provide user fixtures and direct DB reads. |
| `src/modules/users/repository.ts` | `userRepository` is used to read stored backup-code digests and account version. |
| `src/modules/account/services/index.ts` | `twoFactorService.buildLoginChallenge` and `.sendLoginCode` are called at the service level. |
| `src/modules/account/session/jwt.ts` | `startSession` and `createAccessToken` build the OAuth-style bearer token. |
| `src/modules/account/two-factor/index.ts` | Barrel import for `DELIVERED_CODE_MAX_ATTEMPTS` and `hashBackupCode`. |
| `src/modules/account/two-factor/backup-codes.ts` | Source of `DELIVERED_CODE_MAX_ATTEMPTS` (wrong-guess ceiling) and `hashBackupCode` (digest for stored-code comparison). |
| `src/infrastructure/persistence/versioning.ts` | `versionOf` extracts the row version to assert that code send/spend operations do not mutate it. |

## Notes

- **`mock` prefix is mandatory.** `jest.mock` hoists factory calls above imports; the only way to reference an outer variable is via a name starting with `mock`. Renaming `mockOutbox` will break the test with a reference error.
- **Each racing request gets its own challenge.** `challengeFor` is called once per `loginWith` invocation inside `Promise.all`. This is deliberate: it ensures the race is purely about code consumption, not about challenge reuse.
- **`forgetSessionEpoch` between phases.** After confirm/setup steps the session epoch is deliberately forgotten so the racing phase starts with a clean slate; without it a stale epoch could mask the real behaviour under test.
- **Wrong-guess ceiling test sends `DELIVERED_CODE_MAX_ATTEMPTS + 3` parallel 422s.** The extra three guarantee the ceiling is hit regardless of scheduling; the final "correct" code must still be rejected (422) because the counter has been exhausted.
- **Version-invariance assertion.** The step-up suite explicitly checks that `versionOf(user)` is unchanged after sending and spending a reauth code, guarding against unintended row-level writes in the mail/code path.
