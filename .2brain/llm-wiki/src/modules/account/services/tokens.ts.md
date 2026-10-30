---
source: src/modules/account/services/tokens.ts
sha256: f42a7c0b62a51936a00a8ba82ffce51d5619a6b49c43a2286e2a34fde9e8c3ed
generated_at: 2026-10-29T02:45:29.408849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Central module for the one-time verification tokens an account holds in `verificationtokens` (password reset, email verify, email change / undo, account restore, MFA login challenge). It defines "live" once and exposes issue / find / spend / redeem primitives that the confirm-controller services compose, plus the shared refusal path (metric + audit + 422).

## Key elements

- **`issueToken`** — Mints a 128-bit random token, stores its SHA digest via `hashToken`, returns the plaintext for the emailed link / challenge response. Atomic replace of a prior same-kind token.
- **`removeTokens`** — Bulk-deletes all tokens of the given kinds for an account (e.g. after successful reset or email change).
- **`tokenSentAt`** — Returns the last `sentAt` for a kind, used by resend-cooldown logic.
- **`findLiveTokenEntry`** — Resolves a token to `{ user, entry }` without spending. The only caller needing the raw row is `verifyLoginChallenge` (reads `entry.amr`).
- **`findLiveToken`** — Thin wrapper returning just the `UserDocument`.
- **`spendLiveToken`** — Atomic delete; returns `true` only for the request whose write actually removed the row (race-loser gets `false`, indistinguishable from "never existed").
- **`redeemLiveToken`** — Composes `findLiveToken` → `spendLiveToken` for confirm controllers with no intermediate work. Password reset does **not** use this (its breach-check needs the user before spending).
- **`OneTimeTokenFlow`** — Union type: `'password_reset' | 'email_verify' | 'email_change' | 'email_change_undo' | 'account_restore'`.
- **`recordOneTimeTokenRejected`** — Increments `authOneTimeTokenRejectedTotal` and writes an audit entry.
- **`refuseLink`** — Calls the above, then returns a `422` `ResponseReject` with an i18n message. Unknown, expired, and already-used are intentionally indistinguishable to the caller.

## Relationships

- **`src/modules/account/repository.ts`** — All token CRUD goes through `verificationTokenRepository` (issue, findLive, spend, removeOfTypes, lastSentAt).
- **`src/infrastructure/security/hash-token.ts`** — Every stored/looked-up token is passed through `hashToken`; plaintext is never persisted.
- **`src/modules/account/metrics.ts`** — Reads `authOneTimeTokenRejectedTotal` counter for the refusal path.
- **`src/modules/account/audit.ts`** — Reads `accountAuditActions.AUTH_ONE_TIME_TOKEN_REJECTED` for the audit action string.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` on every refused link.
- **`src/infrastructure/http/response.ts`** — Uses `generateReject` / `ResponseReject` to build the 422 response.
- **`src/infrastructure/i18n/index.ts`** — Uses `t` to resolve the flow-specific "token not found" message.
- **`src/modules/account/services/password-reset.ts`** — Consumes `findLiveTokenEntry` + `spendLiveToken` separately (breach-check runs between them); calls `issueToken` / `removeTokens` / `tokenSentAt` for the request side.
- **`src/modules/account/services/email-change.ts`** — Consumes `issueToken`, `redeemLiveToken`, `removeTokens` for change and undo flows.
- **`src/modules/account/services/account-deletion.ts`** — Consumes the confirm-flow primitives for the `account_restore` flow.
- **`src/modules/account/services/index.ts`** — Re-exports this module so upstream callers import from the barrel.

## Notes

- `issueToken`, `findLiveToken`, `spendLiveToken`, and `redeemLiveToken` are marked `@internal` and deliberately kept **off** `accountService` so that only this module's confirm flows can mint or burn credentials.
- The module doc explicitly calls out that `redeemLiveToken` is for controllers with no work between find and spend; any flow that needs the user object *before* spending (password reset breach check) must call the two halves itself.
- A refusal never reveals *why* (unknown vs expired vs already-used) — the 422 body and audit metadata are identical for all three cases.
- Token entropy is 128 bits (16 bytes hex), chosen to match what `hashToken`'s plain-digest assumption expects.
