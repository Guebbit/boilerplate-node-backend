---
source: src/modules/account/tests/integration/link-crash-window.test.ts
sha256: d5b2450e4655ea4c5e260b705ab25025da33f1bbcae3ea58111d3aa3995f6399
generated_at: 2026-11-14T19:04:37.626844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/link-crash-window.test.ts

## Purpose

Integration tests that prove the atomicity contract of one-time link spending: the token spend and the account write it unlocks commit in a single transaction. Each test fails the *write* (not the spend) to verify the transaction rolls back, leaving the token live and the account unchanged, then retries successfully. One case per link flow (verify, email-change confirm, email-change undo, OAuth link, TOTP confirm) plus targeted sub-cases (transient retry, outbox-write failure, 409 conflict, race with a concurrent confirmation).

## Key elements

- **`connectionReset()`** – Returns a plain `ECONNRESET` error with no MongoDB driver label, ensuring the driver does *not* auto-retry the transaction.
- **`transientFailure()`** – Returns a `MongoServerError` tagged with `TransientTransactionError`, triggering a full transaction re-run by the driver.
- **`holds(userId, type)`** – Asks the account's token collection whether a given token type is still present.
- **`storedField(userId, key)`** – Reads a single account field (including credentials) via `userRepository.findByIdWithCredentials`.
- **`addressesOf(userId)`** – Returns `{ email, previousEmail, pendingEmail }` for matcher comparison.
- **`pendingChange()`** – Creates a verified account, sets `pendingEmail`, and plants an `email-change` confirmation token.
- **`changedAccount()`** – Creates a verified account with `previousEmail` set and a live `email-change-undo` token.
- **`lockedAccount(email)`** – Creates an account in the soft-delete grace window (`deletedAt`, `purgeAt` set).
- **`armedAccount()`** – Provisions TOTP via the HTTP API and returns the account plus its one-time backup codes.
- **`describe` blocks** – One per link flow; each contains a "fails → stays live → retries OK" assertion pair, plus flow-specific edge cases (transient retry preserves undo address, outbox-row failure, 409 conflict kills all sessions, race between undo and confirm).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | Imports `outboxEventModel` (spied to simulate outbox-write failure) and `settleOutboxNudges` (flushes pending nudge jobs after a test). |
| `src/modules/account/repository.ts` | Imports `verificationTokenRepository`; spies on `.spend` in the race-condition test to interleave a competing write. |
| `src/modules/account/services/oauth.ts` | Imports `startOAuthLink`, `linkProviderToSignedInAccount`, `OAuthIdentityTakenError` for the OAuth-link crash-window case. |
| `src/modules/account/services/two-factor-challenge.ts` | Imports `buildLoginChallenge` to set up a 2FA login flow. |
| `src/modules/account/tests/factories.ts` | Imports `plantToken`, `sessionRowsOf`, `tokenTypesOf` for token seeding and session inspection. |
| `src/modules/users/repository.ts` | Imports `userRepository`; spies on `.save` to inject the write failure, and reads account fields for assertions. |
| `src/modules/users/tests/factories.ts` | Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for account creation and credential constants. |
| `tests/support/http.ts` | `api()` – supertest-style HTTP client for all endpoint calls. |
| `tests/support/environment.ts` | `setEnvironment` – sets `NODE_MAIL_TRANSPORT: 'outbox'` so no real mail is sent. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` – provisions a clean MongoDB instance before the suite. |
| `tests/support/totp.ts` | `codeFor` – generates a TOTP code for a given secret. |
| `tests/support/cookies.ts` | `cookieHeader` – extracts the session cookie from a login response. |
| `tests/support/session-epoch.ts` | `forgetSessionEpoch` – invalidates the cached session epoch after a TOTP state change. |
| `tests/support/callers.ts` | `testCallerContext` – provides caller metadata for API calls that require it. |

## Notes

- The critical design choice is failing the write **after** the token spend has already executed. Failing the spend itself would not prove the rollback; the token row only reappears because the surrounding transaction aborted. This is the invariant documented in `docs/modules/account-sessions.md#spending-a-link`.
- `connectionReset()` deliberately omits any `errorLabels` array so the MongoDB driver treats it as a non-transient error and does not silently re-run the transaction. The assertion then verifies the application-level rollback, not a driver retry.
- The transient-retry test (`transientFailure()`) exercises the opposite path: the driver re-runs the whole transaction from scratch, so the second attempt sees the partially-edited document. The test asserts `previousEmail` is preserved and exactly **one** `user.profile_changed` outbox row exists.
- The 409 conflict test (undo link + address already taken) additionally verifies that **all** existing sessions for the account are terminated even though the email field is unchanged — a deliberate security behavior.
- The race-condition test monkey-patches `verificationTokenRepository.spend` to inject a competing `updateMany` between the token lookup and the real transaction, simulating a concurrent confirmation arriving in the window.
- `afterEach` calls `jest.restoreAllMocks()`; individual tests use `mockRejectedValueOnce` / `mockImplementationOnce` so spies are auto-cleaned.
