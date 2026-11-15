---
source: src/modules/account/services/tokens.ts
sha256: a0e03d813b9951079f56b6527131f0f57dbc15c4ac497eb9d770978be94e7447
generated_at: 2026-11-14T18:52:12.824850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Central manager for the one-time verification tokens an account holds in the `verificationtokens` collection (password reset, email verification, email change + undo, deletion restore, MFA login challenge). It defines what "live" means, separates finding from spending, and guarantees that spending a link and performing the unlocked action happen in a single database transaction so a partial failure never burns the token or leaves a half-applied action.

## Key elements

- **`issueToken`** — Mints a 128-bit random token, stores only its hash, and returns the plaintext for the email link or MFA challenge response. Replaces any existing live token of the same kind atomically.
- **`removeTokens`** — Deletes all tokens of the given kinds for an account (e.g., after a password change).
- **`tokenSentAt`** — Returns the last-sent timestamp for a token kind, used for resend cooldowns.
- **`findLiveTokenEntry`** — Looks up the account and raw row for a live token of a given type without spending it. Returns `undefined` for every refusal reason. Used by MFA challenge (needs `entry.amr`).
- **`findLiveToken`** — Convenience wrapper returning only the `UserDocument`.
- **`spendLiveToken`** — Atomically deletes the token row inside a caller-supplied `ClientSession`. Returns `false` on a race loss (treated identically to "token not found").
- **`spendThen`** — Composes `spendLiveToken` + the action's writes in one `withTransaction`. On success, nudges the outbox. On failure or race loss, nothing commits. Non-DB side effects (email, audit, session cleanup) must run *after* this resolves.
- **`redeemLiveToken`** — `findLiveToken` → `spendThen` in one call, for confirm flows whose action is a single transaction on the holder. Password reset and MFA challenge bypass this (they check something between find and spend).
- **`OneTimeTokenFlow`** (type) — The union of flows that spend a link token.
- **`recordOneTimeTokenRejected`** — Increments the `authOneTimeTokenRejectedTotal` metric and writes an audit row for a refused link.
- **`refuseLink`** — Builds the uniform 422 `ResponseReject` (i18n message, no distinction between unknown / expired / already-used) and calls `recordOneTimeTokenRejected`.

## Relationships

- **`src/modules/account/repository.ts`** — All token reads/writes go through `verificationTokenRepository`; this file is its sole caller within the services layer.
- **`src/infrastructure/security/hash-token.ts`** — Every token value is digested via `hashToken` before storage or lookup; plaintext never touches the database.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the Mongoose `ClientSession` that binds spend + action into one atomic unit.
- **`src/kernel/outbox.ts`** — `nudgeOutbox` wakes the relay after a successful `spendThen` commit so pending event rows are picked up.
- **`src/modules/account/audit.ts` / `src/modules/account/metrics.ts`** — Rejected links are counted (`authOneTimeTokenRejectedTotal`) and audited (via `accountAuditActions` from `src/modules/account/audit.ts`) inside `recordOneTimeTokenRejected`.
- **`src/infrastructure/http/response.ts` / `src/infrastructure/i18n/index.ts`** — `refuseLink` assembles the 422 body with `generateReject` and the localized message from `t`.
- **`src/modules/account/services/email-change.ts`, `src/modules/account/services/account-deletion.ts`, `src/modules/account/services/deletion-sign-in.ts`, `src/modules/account/services/oauth.ts`** — Downstream consumers that call `issueToken`, `redeemLiveToken`, `findLiveTokenEntry`, or the raw find/spend halves depending on whether they need to inspect the row before spending.
- **`src/modules/account/services/index.ts`** — Re-exports this module's public surface for the rest of the account module.

## Notes

- **Uniform refusal.** `refuseLink` deliberately returns the same 422 body for "never existed", "expired", and "already spent". Callers cannot distinguish them; this is a security choice, not a bug.
- **`spendThen` return contract.** A successful `act` must resolve to something other than `undefined`; `undefined` is the sentinel for "this request did not win the spend." Forgetting to return a value from `act` silently converts a success into a refusal.
- **Side-effect placement.** Anything that is not a database write (sending email, extra audit rows, session cleanup) must run *after* `spendThen` resolves, because the transaction driver may re-execute `act` on a transient error.
- **Not on `accountService`.** `issueToken`, `findLiveToken`, `spendLiveToken`, and `redeemLiveToken` are intentionally kept out of the account service's public API; only this module's own confirm flows may call them.
- **MFA challenge** reads `entry.amr` off the matched row, which is why it uses `findLiveTokenEntry` rather than `findLiveToken`.
