---
source: src/modules/account/services/previous-email-cleanup.ts
sha256: 1b8d430014104e90dd25a0b9ffb956c73eff58612b1c7b310e983b56f6c29790
generated_at: 2026-10-14T08:51:20.666668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/previous-email-cleanup.ts

## Purpose

Implements the nightly `reap:previous-emails` sweep: a data-minimisation pass that forgets the previous email address stored on any account whose 7-day undo link is no longer live. Once nothing can restore the old address, retaining it serves no purpose.

## Key elements

- **`reapLapsedPreviousEmails`** (exported) — Queries the verification-token repository for all user IDs that *do* have a live `EMAIL_CHANGE_UNDO_TOKEN`, then hands that "keep" set to `userService.clearLapsedPreviousEmail` so every other account's previous email is cleared. Returns a `Promise<number>` — the count of accounts cleared.

## Relationships

- **`src/modules/account/repository.ts`** — Provides `verificationTokenRepository`, from which this module calls `.userIdsWithLive(type, date)` to obtain the set of users still protected by a live undo token.
- **`src/modules/account/token-types.ts`** — Supplies the `EMAIL_CHANGE_UNDO_TOKEN_TYPE` constant used to scope the repository query.
- **`src/modules/users/index.ts`** (and its `services/index.ts`) — Source of `userService`, which executes the actual `clearLapsedPreviousEmail(keep)` write.
- **`scripts/ops/reap-previous-emails.ts`** — The operational entry point that invokes this function on a schedule (the "nightly sweep").
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module so other code can import `reapLapsedPreviousEmails` from the services index.
- **`src/modules/account/tests/integration/email-change-lapse.test.ts`** — Integration tests exercising the lapse/clear path.

## Notes

- "Lapsed" is defined purely by the *absence* of a live undo token. Expired, spent, and revoked tokens all read the same: no live token → the account is eligible for clearing.
- The file does **not** sweep expired sessions or one-time tokens; those rows carry their own TTL and are deleted by the database. Only the `previous_email` column needs explicit cleanup.
- The function is intentionally a two-step read-then-write (query keep-set → bulk clear) rather than a single correlated SQL, keeping the write logic in the users module.
