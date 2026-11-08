---
source: src/modules/account/services/tokens.ts
sha256: f42a7c0b62a51936a00a8ba82ffce51d5619a6b49c43a2286e2a34fde9e8c3ed
generated_at: 2026-11-08T04:23:38.108750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Manages the full lifecycle of one-time verification tokens (password reset, email verification, account-deletion confirmation, email-change + undo, and the login MFA challenge) stored in the `verificationtokens` table. It is the single place where "live" is defined, where tokens are minted/spent, and where every refusal is counted, audited, and answered with an indistinguishable 422.

## Key elements

- **`issueToken`** – Mints a 128-bit random token, stores its hash (with TTL and optional `amr`), returns the plaintext for the outbound link/challenge. A type that permits one live link atomically replaces the prior one.
- **`removeTokens`** – Bulk-deletes all tokens of the specified types for a user.
- **`tokenSentAt`** – Returns the last `sentAt` for a (user, type) pair; used for resend cooldowns.
- **`findLiveTokenEntry`** – Finds the holder *and* the matched row without spending. The only caller needing the row is `verifyLoginChallenge` (reads `entry.amr`).
- **`findLiveToken`** – Thin wrapper over `findLiveTokenEntry` that returns just the `UserDocument`.
- **`spendLiveToken`** – Atomically deletes the token row; returns `true` only if *this* request won the delete race.
- **`redeemLiveToken`** – Composes `findLiveToken` → `spendLiveToken` for confirm controllers that have no work between the two. Not used by password reset (its breach-check needs the user before spending).
- **`OneTimeTokenFlow`** – Union of the five confirm-flow identifiers used in metrics/audit labels.
- **`recordOneTimeTokenRejected`** – Increments `authOneTimeTokenRejectedTotal` and writes an audit row for a refused link.
- **`refuseLink`** – Calls `recordOneTimeTokenRejected`, then returns a 422 `ResponseReject` with a flow-specific i18n message.

## Relationships

- **`@infrastructure/security/hash-token`** – `hashToken` is applied before every repository call so the DB never sees plaintext.
- **`@infrastructure/observability/audit`** – `recordAudit` is called on every token refusal.
- **`@infrastructure/http/response`** – `generateReject` / `ResponseReject` shape the 422 returned by `refuseLink`.
- **`@infrastructure/i18n`** – `t` localizes the refusal message per flow.
- **`../repository`** – All persistence goes through `verificationTokenRepository` (`issue`, `findLive`, `spend`, `removeOfTypes`, `lastSentAt`).
- **`../audit`** – `accountAuditActions.AUTH_ONE_TIME_TOKEN_REJECTED` labels the audit event.
- **`../metrics`** – `authOneTimeTokenRejectedTotal` counter, keyed by flow.
- **`@modules/users`** – `userService.findByIdWithCredentials` resolves the token holder to a full `UserDocument`.
- **Consumers (per docstring):** `two-factor-challenge.ts` and `completePasswordReset` call `findLiveToken` and `spendLiveToken` separately because they need the user between the two; other confirm controllers use `redeemLiveToken` directly.

## Notes

- Every refusal reason (unknown token, expired, already-spent, race-loser) is intentionally indistinguishable to the caller: same 422, same generic message. Do not add different status codes or messages per cause.
- Tokens are 128-bit (`randomBytes(16)`); the hex string is the only form that ever leaves the module. Storage keeps only the digest.
- Functions marked `@internal` (`issueToken`, `findLiveToken`, `spendLiveToken`, `redeemLiveToken`) are deliberately kept out of `accountService` so only this module's flows can mint, resolve, or burn links.
- `redeemLiveToken` must not be used by any flow that needs the resolved user *before* the spend (e.g. password-reset breach check); such flows compose the two halves themselves.
- The `amr` field is MFA-challenge-only; it records how the first factor was attested and is read back by the login-challenge verifier.
