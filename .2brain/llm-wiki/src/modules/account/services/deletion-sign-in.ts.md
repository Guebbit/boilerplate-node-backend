---
source: src/modules/account/services/deletion-sign-in.ts
sha256: 84de93e4f455569711dada343dcfdddcbe7d7f4f6feca3e8f2afa7486796f1c7
generated_at: 2026-10-29T02:39:57.718758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/deletion-sign-in.ts

## Purpose

Implements the sign-in response and restore flow for accounts in a deletion grace period. When such an account signs in successfully, this module mints a short-lived "claim check" token instead of a session. The caller can later redeem that token via `POST /account/login/restore` to cancel the pending deletion and receive the data needed to create a session.

## Key elements

- **`buildDeletionPending`** (exported) – Issues a `DELETION_RESTORE_TOKEN_TYPE` token carrying the sign-in's `amr` factors and returns a `DeletionPending` body (`deletionPending: true`, `challenge`, `expiresAt`, `purgeAt`).
- **`RestoredSignIn`** (exported interface) – Shape returned on successful restore: the restored `UserDocument` and the original `amr` array.
- **`redeem`** (module-private) – Validates the live token entry, performs an atomic `spendLiveToken`, and on success calls `restoreAccount`. Returns a uniform 401 refusal on any failure.
- **`restoreAtSignIn`** (exported) – Public handler for `POST /account/login/restore`. Looks up the token, delegates to `redeem`, and maps database errors through `rejectDatabaseEnvelope`.

## Relationships

- **`../token-types`** – Imports `DELETION_RESTORE_TOKEN_TYPE` used as the token kind for claim checks.
- **`./account-deletion`** – Calls `restoreAccount` to cancel the pending deletion after the token is spent.
- **`./tokens`** – Uses `issueToken`, `findLiveTokenEntry`, and `spendLiveToken` to mint, look up, and atomically consume claim checks.
- **`./two-factor-challenge`** – Reuses `MFA_CHALLENGE_TTL_MS` as the lifetime of the claim-check token.
- **`@modules/users`** – Imports `isRestorable` (guards that the account is still in grace) and the `UserDocument` type.
- **`@types`** – Imports `CallerContext` and `DeletionPending` response types.
- **`@infrastructure/http/response`** – Builds `ResponseSuccess` / `ResponseReject` envelopes.
- **`@infrastructure/http/errors`** – Wraps unexpected database errors via `rejectDatabaseEnvelope`.
- **`@infrastructure/i18n`** – Localises the single refusal message.
- **`./index`** – Re-exports this module's public surface (implied by barrel pattern).

## Notes

- Every refusal path (unknown token, expired, already spent, grace lapsed) returns the **same 401 with the same i18n string** by design, so callers cannot distinguish which condition triggered it.
- Restoration is race-safe: `spendLiveToken` is the only gate, and `redeem` checks its boolean return before calling `restoreAccount`. Two concurrent restore requests cannot both succeed.
- `MFA_CHALLENGE_TTL_MS` is imported from the two-factor service purely as a duration constant; it does **not** imply an MFA challenge is issued here.
- `buildDeletionPending` is expected to be called only *after* all authentication factors have been satisfied (per the module doc-block), so the second factor is not re-challenged at restore time.
