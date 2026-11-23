---
source: src/modules/account/services/deletion-sign-in.ts
source_sha256: d462ea57749f1c60777b0d2e44cd49ca507948fdaa447b616a561942fa3585cf
context_sha256: 9bce87d8071b4bfd01e90d3b1876bda4369a057d99a2df594a87739d568f002e
generated_at: 2026-11-22T03:36:00.177031+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/deletion-sign-in.ts

## Purpose
Handles the sign-in side of the account-deletion grace period. When a user who has scheduled their account for erasure logs in, no session is issued. Instead they get a short-lived "claim check" token. Redeeming it at `POST /account/login/restore` cancels the deletion and returns what the caller needs to start a session.

## Key elements
- **`buildDeletionPending(user, amr)`** — Issues a `DELETION_RESTORE_TOKEN_TYPE` token via `issueToken`. The TTL is `MFA_CHALLENGE_TTL_MS`, and `amr` is stored on the token. Returns a `DeletionPending` body: `deletionPending: true`, `challenge`, `expiresAt`, and `purgeAt`. It is called only after all of the account's factors have passed, so the second factor is asked once. Marked `@internal` and kept off `accountService`, because it mints a claim check without a password and only the login doors may call it.
- **`RestoredSignIn`** — Interface `{ user: UserDocument; amr: readonly string[] }`. It is what a redeemed claim check hands back.
- **`restoreAtSignIn(challenge, context)`** — Exported entry point for `POST /account/login/restore`. It looks up the live token with `findLiveTokenEntry`, then redeems it. Database errors are mapped through `rejectDatabaseEnvelope('auth', error)`.
- **`redeem` (private)** — Refuses with a 401 (`account.login.restore-challenge-invalid`) if the token is not found, has no `amr`, or the user is not `isRestorable`. Otherwise it calls `spendThen` with `restoreWrites(user, new Date())`. If the spend succeeded, it runs `finishRestore(user, 'sign-in', context)` and returns `generateSuccess({ user, amr })`.

## Relationships
- **`src/modules/account/services/account-deletion.ts`** supplies `restoreWrites` (the writes done in the same transaction as the token spend) and `finishRestore` (the post-restore step).
- **`src/modules/account/services/tokens.ts`** supplies `issueToken`, `findLiveTokenEntry` and `spendThen`.
- **`src/modules/account/services/two-factor-challenge.ts`** supplies `MFA_CHALLENGE_TTL_MS`, which is reused as the claim check's lifetime.
- **`src/modules/account/token-types.ts`** supplies `DELETION_RESTORE_TOKEN_TYPE`.
- **`src/modules/users/index.ts`** and **`src/modules/users/authenticatable.ts`** relate to the `@modules/users` import, which supplies `isRestorable` and the `UserDocument` type.
- **`src/infrastructure/http/response.ts`** supplies `generateSuccess` and `generateReject` and the response types.
- **`src/infrastructure/http/errors.ts`** supplies `rejectDatabaseEnvelope`.
- **`src/infrastructure/i18n/index.ts`** supplies `t` for the refusal message.
- **Controllers** (`src/modules/account/controllers/post-login.ts`, `post-login-2fa.ts`, `get-oauth-callback.ts`) are the login paths that can end in a `DeletionPending` answer. `restoreAtSignIn` serves the restore endpoint and returns the `user` and `amr` that the session is built from.
- **`src/modules/account/services/index.ts`** is the services barrel in the same directory.

## Notes
- The claim check is single-use. Only the request whose own write removed the token may restore. A failing write rolls the spend back, so the token stays live for a retry.
- Every refusal answers 401 alike: unknown, expired, spent, and an account whose grace ran out in the meantime.
- `purgeAt` falls back to `new Date()` only to satisfy the schema's optional type. `isRestorable` guarantees it is set.
- `expiresAt` is computed from `Date.now()` after the token is issued, so it may differ slightly from the token's stored expiry.
- The file's module comment points to a data-retention document on self-deletion grace for background.
