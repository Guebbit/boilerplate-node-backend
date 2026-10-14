---
source: src/modules/account/services/tokens.ts
sha256: 6c6e963f07e34d4ad5f7e76e7bf769990727c94524deb6937d1d8adc156e7c76
generated_at: 2026-10-14T08:54:44.146351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Central service for all one-time verification tokens an account holds in the `verificationtokens` collection — password reset, email verification, email change (and undo), account deletion, and the MFA login challenge. It owns the "live" definition (exists, correct type, not expired), the find/spend/redeem split, and the rejection audit+metric path. Plaintext tokens are generated here and returned to the caller for the emailed link or challenge response; only the hash is persisted.

## Key elements

- **`issueToken(userId, type, ttlMs, amr?)`** — Generates a 128-bit hex token, stores its hash with `sentAt`/`expiresAt` (and optional `amr` for MFA), and returns the plaintext. A kind that allows one live link replaces the prior one in the same atomic write.
- **`removeTokens(userId, types)`** — Deletes every token of the given kinds for an account.
- **`tokenSentAt(userId, type)`** — Returns the last `sentAt` for a kind, used by resend-cooldown logic.
- **`findLiveTokenEntry(type, token)`** — Looks up the live token row and the owning user (with credentials). Returns `{ user, entry }` or `undefined`. The `entry` exposes fields like `amr` needed by the MFA challenge flow.
- **`findLiveToken(type, token)`** — Thin wrapper around `findLiveTokenEntry` that returns only the user.
- **`spendLiveToken(type, token)`** — Atomically deletes the token row. Returns `true` only for the request whose write actually removed it (the race loser gets `false` and is indistinguishable from a missing token).
- **`redeemLiveToken(type, token)`** — Composes `findLiveToken` → `spendLiveToken` for confirm controllers with no work between the two halves.
- **`OneTimeTokenFlow`** (type) — Union of the four flows that spend a link token: `password_reset | email_verify | email_change | account_delete`.
- **`recordOneTimeTokenRejected(context, flow)`** — Increments the `auth_one_time_token_rejected_total` counter and writes an audit entry.

## Relationships

- **`src/modules/account/repository.ts`** — All token reads/writes go through `verificationTokenRepository` (`issue`, `removeOfTypes`, `lastSentAt`, `findLive`, `spend`). This file never touches the collection directly.
- **`src/infrastructure/security/hash-token.ts`** — Every token value is passed through `hashToken` before being stored or compared; plaintext never hits the DB.
- **`src/modules/users/index.ts`** — `findLiveTokenEntry` / `redeemLiveToken` resolve the owning user via `userService.findByIdWithCredentials`.
- **`src/modules/account/token-types.ts`** — Provides the `VerificationTokenType` enum used as the discriminant throughout.
- **`src/modules/account/services/password-reset.ts`** — Uses `findLiveTokenEntry` + `spendLiveToken` *separately* (needs the user for a breach check before spending), not `redeemLiveToken`.
- **`src/modules/account/services/two-factor-challenge.ts`** — Uses `findLiveTokenEntry` to read `entry.amr`, then `spendLiveToken` independently.
- **`src/modules/account/services/email-change.ts`**, **`verification.ts`**, **`deletion-request.ts`** — Issue tokens via `issueToken`; confirm via `redeemLiveToken`.
- **`src/modules/account/services/revocation.ts`** — Calls `removeTokens` to invalidate outstanding links.
- **`src/modules/account/services/index.ts`** — Re-exports this module for consumers.
- **`src/infrastructure/observability/audit.ts`** + **`src/modules/account/audit.ts`** + **`src/modules/account/metrics.ts`** — `recordOneTimeTokenRejected` writes an audit line and increments a Prometheus counter.

## Notes

- **Deliberate refusal ambiguity.** Every failure mode (wrong type, expired, wrong hash, already spent) returns `undefined` / `false` with no reason. Do not add distinguishing error messages here.
- **`redeemLiveToken` is not universal.** The password-reset and two-factor flows intentionally call `findLiveTokenEntry` and `spendLiveToken` separately because they need the user/entry *before* the spend. Only "dumb" confirm controllers should use the composed helper.
- **Race safety.** `spendLiveToken` is the only point where a token is deleted; the repository guarantees that of N simultaneous spends, exactly one returns `true`.
- **Metric prefix.** Rejections use `auth.` (not `security.`) because the expected cause is a customer following a stale or mistyped link, not an attack — it should not page the platform operator.
- **`amr` is optional and MFA-only.** It records how the first factor was proven during the login challenge; it is absent on all other token types.
