---
source: src/modules/account/services/deletion-sign-in.ts
sha256: 84de93e4f455569711dada343dcfdddcbe7d7f4f6feca3e8f2afa7486796f1c7
generated_at: 2026-11-08T04:16:35.434066+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/deletion-sign-in.ts

## Purpose

Implements the sign-in half of the account-deletion grace period: when a user whose account is scheduled for erasure attempts to log in, they receive a one-time claim check instead of a session. Redeeming that check at `POST /account/login/restore` cancels the deletion and returns the data needed to mint the session.

## Key elements

- **`buildDeletionPending(user, amr)`** — Assembles the `DeletionPending` response body for a sign-in on a grace-period account. Mints a `DELETION_RESTORE_TOKEN_TYPE` token (TTL borrowed from `MFA_CHALLENGE_TTL_MS`) and returns `{ deletionPending: true, challenge, expiresAt, purgeAt }`.
- **`RestoredSignIn`** (interface) — Shape returned on successful restore: the `UserDocument` and the `amr` array recorded at sign-in.
- **`redeem(found, challenge, context)`** *(private)* — Validates the live token entry, atomically spends the claim check via `spendLiveToken`, then calls `restoreAccount`. Returns a 401 refusal if any check fails.
- **`restoreAtSignIn(challenge, context)`** — Public handler for `POST /account/login/restore`. Looks up the live token, delegates to `redeem`, and wraps unexpected errors with `rejectDatabaseEnvelope`.

## Relationships

- **`./tokens`** — Source of `findLiveTokenEntry`, `issueToken`, and `spendLiveToken`; provides the atomic spend that guarantees only one restore request succeeds.
- **`./account-deletion`** — Provides `restoreAccount`, which performs the actual cancel-deletion write.
- **`./two-factor-challenge`** — Contributes `MFA_CHALLENGE_TTL_MS`, reused as the claim-check TTL (not a deletion-specific constant).
- **`../token-types`** — Supplies the `DELETION_RESTORE_TOKEN_TYPE` discriminator used in all token operations.
- **`@modules/users`** — Imports `isRestorable` (gate: account still in grace) and the `UserDocument` type.
- **`@types`** — Imports `CallerContext` and the `DeletionPending` response schema.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP envelope.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` formats unexpected DB failures.
- **`@infrastructure/i18n`** — `t` resolves the single user-facing refusal string.
- **`./index.ts`** (barrel) — Re-exports this module for external consumers.

## Notes

- All refusal paths (unknown, expired, already-spent, grace lapsed) return the **same 401 + same i18n message**; callers cannot distinguish why the restore failed.
- Atomicity is enforced by `spendLiveToken`: the restore write proceeds only if *this* request's write was the one that removed the token row.
- `MFA_CHALLENGE_TTL_MS` is a two-factor constant repurposed here for the claim-check lifetime — changing it in `two-factor-challenge.ts` silently changes the deletion-restore window.
- `buildDeletionPending` is only called *after* all auth factors have passed (per the doc comment), so the second factor is not re-challenged during restore.
