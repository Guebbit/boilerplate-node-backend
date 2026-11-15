---
source: src/modules/account/services/deletion-sign-in.ts
sha256: 9174f53de0006ca0a818c7d9a36e099fbdea62007eaefee1f2699e79f08e42d6
generated_at: 2026-11-14T18:42:35.959944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/deletion-sign-in.ts

## Purpose

Implements the sign-in half of the account-deletion grace period. When a user with a scheduled purge (`purgeAt`) attempts to log in, this module issues a one-time **claim check** token instead of a session. A subsequent restore request spends that token, cancels the deletion, and returns the user + `amr` needed to mint the actual session.

## Key elements

- **`buildDeletionPending(user, amr)`** *(exported)* — Mints a `DELETION_RESTORE_TOKEN_TYPE` token (TTL = `MFA_CHALLENGE_TTL_MS`) and returns the `DeletionPending` response body: `{ deletionPending, challenge, expiresAt, purgeAt }`. Called by the login controllers *after* all authentication factors have passed.
- **`RestoredSignIn`** *(exported interface)* — `{ user: UserDocument; amr: readonly string[] }`, the payload returned on a successful restore.
- **`redeem(found, challenge, context)`** *(private)* — Validates the live token entry, atomically spends the challenge via `spendThen`, runs `restoreWrites` + `finishRestore`, and returns either `ResponseSuccess<RestoredSignIn>` or a 401 reject.
- **`restoreAtSignIn(challenge, context)`** *(exported)* — Public entry point for the restore route. Looks up the live token entry, delegates to `redeem`, and catches DB errors into a standard `rejectDatabaseEnvelope`.

## Relationships

- **`@modules/users`** (`authenticatable.ts`) — Imports `isRestorable` (guards both `buildDeletionPending` and `redeem`) and the `UserDocument` type.
- **`./account-deletion`** — Imports `restoreWrites` (builds the transactional writes that cancel the purge) and `finishRestore` (post-restore bookkeeping, tagged `'sign-in'`).
- **`./tokens`** — Imports `issueToken` (mint the claim check), `findLiveTokenEntry` (look up + validate), and `spendThen` (atomic spend-with-fallback).
- **`./two-factor-challenge`** — Imports `MFA_CHALLENGE_TTL_MS` as the claim-check TTL.
- **`../token-types`** — Imports `DELETION_RESTORE_TOKEN_TYPE`.
- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all return values.
- **`@infrastructure/http/errors`** — Catches unexpected DB errors via `rejectDatabaseEnvelope('auth', error)`.
- **`@infrastructure/i18n`** — Uses `t('account.login.restore-challenge-invalid')` for the single refusal message.
- **Controllers** (`post-login`, `post-login-2fa`, `get-oauth-callback`) — Call `buildDeletionPending` when the authenticated user is in grace; call `restoreAtSignIn` for the restore flow.

## Notes

- **Deliberately not on `accountService`.** The JSDoc states the claim check "stays off `accountService`" so that only the login doors (the three controllers) can mint one.
- **Single refusal shape.** All failure modes — unknown, expired, already spent, grace window elapsed — return the same `401` with the same i18n key. This prevents enumeration of *why* a challenge was rejected.
- **Atomicity.** `spendThen` guarantees that if `restoreWrites` throws, the spend is rolled back and the claim check remains live for a retry.
- **TTL reuse.** The claim-check lifetime borrows `MFA_CHALLENGE_TTL_MS` from the 2FA module rather than defining its own constant.
- **`purgeAt` fallback.** `buildDeletionPending` guards with `user.purgeAt ?? new Date()` even though `isRestorable` should guarantee the field is present — the optional is a schema-level accommodation for non-restorable rows.
