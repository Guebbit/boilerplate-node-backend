---
source: src/modules/account/services/tokens.ts
sha256: 31fcf2ece0332cdb8a92957d9dc8db19ab144914fc09a0a0a02951c072a398bd
generated_at: 2026-10-15T10:03:18.333182+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Manages the full lifecycle of one-time verification tokens (password reset, email verify, email change + undo, account-delete confirm, MFA login challenge) stored in the `verificationtokens` collection. Defines what "live" means, provides issue / find / spend / redeem primitives, and produces the uniform 422 refusal every dead-link controller returns.

## Key elements

- **`issueToken(userId, type, ttlMs, amr?)`** — Generates a 128-bit hex token, stores its hash via `hashToken`, and returns the plaintext for the caller to email or display. A kind that allows only one live link replaces the previous row atomically.
- **`removeTokens(userId, types)`** — Deletes every token of the given types for an account.
- **`tokenSentAt(userId, type)`** — Returns the `sentAt` date of the most recent token of that type (used for resend cooldowns).
- **`findLiveTokenEntry(type, token)`** — Locates the user **and** the raw row holding a live token (exists, correct type, not expired) without spending it. Intended for `verifyLoginChallenge`, which reads `entry.amr`.
- **`findLiveToken(type, token)`** — Thinner wrapper over `findLiveTokenEntry`; returns only the `UserDocument`.
- **`spendLiveToken(type, token)`** — Atomically deletes the token row. Returns `true` only for the request whose own write removed it; `false` means a race loser (indistinguishable from "never existed").
- **`redeemLiveToken(type, token)`** — Composes `findLiveToken` + `spendLiveToken` for confirm controllers that have no intervening work (email verify, email change, delete confirm).
- **`OneTimeTokenFlow`** (type) — Union of the five confirm flows: `password_reset | email_verify | email_change | email_change_undo | account_delete`.
- **`recordOneTimeTokenRejected(context, flow)`** — Increments `authOneTimeTokenRejectedTotal` and writes an audit event with actor `anonymous`.
- **`refuseLink(context, flow, messageKey)`** — Calls `recordOneTimeTokenRejected`, then returns a `generateReject(422, …)` with an i18n-translated message. Unknown, expired, and already-used all produce the identical response.

## Relationships

- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is applied to every token before storage or lookup; the file never stores or compares plaintext tokens.
- **`src/modules/account/repository.ts`** — `verificationTokenRepository` is the sole data-access layer; all `issue`, `removeOfTypes`, `lastSentAt`, `findLive`, and `spend` calls go through it.
- **`src/modules/account/audit.ts`** — Supplies the `accountAuditActions.AUTH_ONE_TIME_TOKEN_REJECTED` constant used in audit records.
- **`src/modules/account/metrics.ts`** — Supplies `authOneTimeTokenRejectedTotal` (the `auth.` prefix is deliberate: a stale link is a customer event, not a platform incident).
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit event on every refusal.
- **`src/infrastructure/http/response.ts`** — `generateReject` builds the 422 `ResponseReject` returned to callers.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` translates the per-flow "token not found" message key.
- **Consumer services** (`password-reset.ts`, `email-change.ts`, `self-delete.ts`, `revocation.ts`, `deletion-request.ts`, `password-reset-request.ts`, `services/index.ts`) import the primitives above. `password-reset.ts` calls `findLiveToken` + `spendLiveToken` separately (it runs a breach check between them); the rest use `redeemLink` or `redeemLiveToken`.

## Notes

- `findLiveToken`/`spendLiveToken` are intentionally separate: `two-factor-challenge.ts` and `completePasswordReset` do extra work (read `amr`, breach-check) between the two halves. `redeemLiveToken` exists only for the flows that don't.
- The 422 body is identical whether the token is unknown, expired, or already spent — a caller cannot distinguish the three cases.
- `spendLiveToken` returning `false` is a lost race, not an error; it is handled exactly like a non-existent token.
- Token entropy is 128 bits (`randomBytes(16)`); the design relies on `hashToken`'s digest being secure given that entropy.
- The `amr` field is set only for the MFA-login-challenge token type and is read back by `verifyLoginChallenge` via `findLiveTokenEntry`.
