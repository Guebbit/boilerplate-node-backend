---
source: src/modules/account/services/tokens.ts
source_sha256: 8c63a00226481e755a2fc80858be34aa8ed72cef633494b37a6d0fee2cda56ac
context_sha256: 69e1557b9001d0239ccf2983d3b4f2871e475733cc9030c16d8fb6467b82cbe5
generated_at: 2026-11-22T03:42:37.058413+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/tokens.ts

## Purpose
Owns the one-time tokens an account holds in `verificationtokens`: reset, verification, deletion confirmation, email-change and its undo, and the login MFA challenge. It defines what "live" means (exists, right type, not expired) in one place. It also provides the spend-and-act primitive that makes a link single-use, and the shared refusal path for dead links.

## Key elements
- `issueToken(userId, type, ttlMs, amr?)`: generates a 128-bit random hex token and stores only its `hashToken` digest via `verificationTokenRepository.issue`. It returns the plaintext once. `amr` is stored only for MFA challenges. It is `@internal` and deliberately not exposed on `accountService`.
- `removeTokens(userId, types)`: deletes all of the account's tokens of the given kinds.
- `tokenSentAt(userId, type)`: returns when a token of that kind was last sent, for resend cooldowns.
- `findLiveTokenEntry(type, token)`: finds a live token without spending it. It returns `{ user, entry }`, where the user is loaded with credentials, or `undefined` for any refusal. `verifyLoginChallenge` uses it to read `entry.amr`.
- `findLiveToken(type, token)`: the same lookup, returning only the holder.
- `spendLiveToken(type, token, session)`: deletes the token row inside a given transaction. It returns `true` only for the request whose write removed the row.
- `spendThen(type, token, act)`: runs the spend and `act` in one `withTransaction`, so both commit or neither does. It returns `act`'s result, or `undefined` if the spend was lost. After a successful commit it calls `nudgeOutbox()`.
- `redeemLiveToken(type, token, act)`: `findLiveToken` followed by `spendThen`, for confirm flows that need nothing between the two steps.
- `OneTimeTokenFlow`: type union of the confirm flows: `password_reset`, `email_verify`, `email_change`, `email_change_undo`, `account_restore`.
- `recordOneTimeTokenRejected(context, flow)`: increments `authOneTimeTokenRejectedTotal` and writes an anonymous failure audit record.
- `refuseLink(context, flow, messageKey)`: records the rejection and returns a 422 `generateReject` with the translated message.

## Relationships
- `src/modules/account/repository.ts`: `verificationTokenRepository` does all persistence (`issue`, `removeOfTypes`, `lastSentAt`, `findLive`, `spend`), and `VerificationTokenRow` comes from there.
- `src/infrastructure/security/hash-token.ts`: `hashToken` digests tokens before any storage or lookup.
- `src/infrastructure/runtime/database.ts`: `withTransaction` supplies the session that `spendThen` shares with `act`.
- `src/kernel/outbox.ts`: `nudgeOutbox` wakes the relay after a committed spend.
- `src/infrastructure/observability/audit.ts` and `src/modules/account/audit.ts`: `recordAudit` is called with the account module's audit action for a rejected one-time token.
- `src/modules/account/metrics.ts`: provides the `authOneTimeTokenRejectedTotal` counter.
- `src/infrastructure/http/response.ts` and `src/infrastructure/i18n/index.ts`: `generateReject` and `t` build the 422 reply in `refuseLink`.
- `src/infrastructure/i18n/context.ts`, `src/modules/account/services/account-deletion.ts`, `src/modules/account/services/deletion-sign-in.ts`, `src/modules/account/services/email-change.ts`, `src/modules/account/services/oauth.ts` and `src/modules/account/services/index.ts` are graph neighbors, but this file's content doesn't show how they interact with it. The account services are likely consumers of its token helpers.

## Notes
- `act` passed to `spendThen` or `redeemLiveToken` must do only database writes, each passed `session`. The driver may retry it on a transient error, so mail and audit rows must be sent after the call resolves.
- `act` must resolve with something other than `undefined`. `undefined` means "spend lost or refused", and it also suppresses the outbox nudge.
- Every refusal looks the same (unknown, expired, already used, lost race), so a caller cannot tell them apart. `refuseLink` follows this with one 422.
- Rejections use the `auth.` metric and audit prefix, not `security.`, so a stale link doesn't page the platform operator.
- A token kind that allows only one live link is replaced atomically in the same write by `issueToken`.
- The 128-bit entropy is what makes the plain (unsalted) `hashToken` digest acceptable.
- The `@internal` functions are intentionally kept off `accountService`.
