---
source: src/modules/account/tests/factories.ts
source_sha256: eebe5b14963dee4008e1c84ead5da0b378d4b5d79d7029a7353b36d57e0c2d03
context_sha256: 83539af614a81d2e636bdef94ed2cc36783a7a5b824923a3064385671120019d
generated_at: 2026-11-22T03:52:08.036961+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/factories.ts

## Purpose
Test helpers for the account module's `sessions` and `verificationtokens` collections. They let a test plant a row whose plaintext credential it knows, read back the rows an account holds, and open a session through the active strategy. They are plain functions over the module's own models and repositories. Suites in other modules can import them from here instead of going through a repository the barrel does not publish.

## Key elements
- **`plantToken(userId, type, plaintext, {ttlMs, sentAt, amr})`**: stores a one-time token through `verificationTokenRepository.issue`, so a one-live-link kind replaces any existing token. The default lifetime is an hour, and a negative `ttlMs` plants an expired token.
- **`plantSession(userId, plaintext, {familyId, mode, ttlMs, startedAt, supersededAt, lastUsedAt})`**: creates a session row directly with `sessionModel.create`. It defaults to `jwt` mode and a one-day lifetime, and sets `purgeAt` to `expiresAt`. It returns the row as a `SessionRow`.
- **`mintSession(userId, options)`**: calls `activeStrategy().issue` with stubbed request and response objects. It skips the password and second-factor checks. `amr` defaults to `[AMR.password]`, and any `IssueOptions` can be overridden. It returns a `MintedSession` with a `bearer` header and a `cookie` header, and works in both `jwt` and `cookie` modes.
- **Session readers**: `sessionRowsOf`, `sessionHashesOf` and `sessionRowFor`. The first two return every row for an account, oldest first, whether live or not. `sessionRowFor` finds a row by the credential's hash, however dead.
- **Token readers**: `tokenRowsOf`, `tokenHashesOf`, `tokenTypesOf` and `tokenRowOf`. They are the same idea for one-time tokens.
- **Session removers**: `dropAllSessions` removes every session an account holds, and `dropSessionOf` removes the one session a credential belongs to. Both go through `sessionRepository`.
- **`reapDueSessions()`**: deletes rows whose `purgeAt` has passed, standing in for the database's TTL monitor.
- **`ageTokenSend(userId, type, ageMs)`**: moves a token's `sentAt` into the past with an update pipeline, so a resend cooldown has run out.
- **`removeTokensOfKind(userId, type)`**: deletes tokens of one kind through `verificationTokenRepository.removeOfTypes`.
- **Types**: `PlantedToken`, `PlantedSession` and `MintedSession`.

## Relationships
- Uses `../model` (`sessionModel`, `verificationTokenModel`, `SessionDocument`) for direct inserts and queries.
- Uses `../repository` (`sessionRepository`, `verificationTokenRepository`, and the `SessionRow` and `VerificationTokenRow` types) wherever production code paths exist, such as `issue`, `removeAll`, `removeByHash`, `findByHash` and `removeOfTypes`.
- Uses `hashToken` from `src/infrastructure/security/hash-token.ts` to turn plaintext credentials into the stored `tokenHash`.
- Uses `activeStrategy`, `IssueOptions` and `SessionRequest` from `../session/strategy` in `mintSession`.
- Uses `AMR` from `../domain/session-proof` for the default proof, and `SESSION_COOKIE` from `src/kernel/cookies.ts` to read the refresh credential and build the cookie header.
- Uses `DAY_MS` and `HOUR_MS` from `src/domain-primitives/time.ts` for default lifetimes.
- The contract suites (`api`, `code-delivery`, `lifecycle`, `oauth`, `reauth` and `two-factor`), `src/modules/account/tests/contract/support.ts` and `src/modules/account/tests/integration/auth-events.test.ts` are its neighbors in the graph. These are the consumers that plant and inspect rows.

## Notes
- `ageTokenSend` ages the recorded `sentAt` instead of faking a clock, because the cooldown reads `sentAt`. It passes `updatePipeline: true` because Mongoose refuses an array update otherwise.
- `reapDueSessions` reads `new Date()`, so it respects a frozen clock, the same as the code under test.
- `mintSession` uses the `bearer` transport. In `cookie` mode the session id comes back in the result. In `jwt` mode the access token comes back in the result, and the refresh token is captured from the stubbed `response.cookie`. It throws `mintSession: the strategy issued nothing` if no credential or refresh value is produced.
- The `sessionRowsOf` and `tokenRowsOf` helpers sort by `_id` ascending and return lean documents.
- `plantSession` writes directly to the model, so unlike `plantToken` it bypasses the repository. Its `purgeAt` is always `expiresAt`, even when `supersededAt` is set.
