---
source: src/modules/account/services/previous-email-cleanup.ts
sha256: 1b8d430014104e90dd25a0b9ffb956c73eff58612b1c7b310e983b56f6c29790
generated_at: 2026-11-08T04:20:51.785683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/previous-email-cleanup.ts

## Purpose

Implements the nightly `reap:previous-emails` sweep. For every account whose 7-day email-change undo token is no longer live (expired, spent, or revoked), it discards the stored previous email address — a data-minimisation step, since the address has no use once it can no longer be restored.

## Key elements

- **`reapLapsedPreviousEmails(): Promise<number>`** — The sole export. Queries the verification-token repository for user IDs that still hold a *live* `EMAIL_CHANGE_UNDO_TOKEN_TYPE` token, then delegates to `userService.clearLapsedPreviousEmail(keepIds)` to wipe the previous addresses of everyone *not* in that set. Returns the count of accounts cleared.

## Relationships

- **`../repository.ts`** — Supplies `verificationTokenRepository`, which provides `.userIdsWithLive(tokenType, asOf)` to determine which accounts still have a valid undo link.
- **`../token-types.ts`** — Provides the `EMAIL_CHANGE_UNDO_TOKEN_TYPE` constant identifying the relevant token.
- **`@modules/users`** (`src/modules/users/index.ts`) — Source of `userService`, whose `clearLapsedPreviousEmail(keepIds)` performs the actual address deletion.
- **`src/modules/account/jobs.ts`** — Expected caller that schedules this function as the nightly cron/task.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this service for consumers outside the account module.

## Notes

- "Lapsed" is defined negatively: the *absence* of a live token, not the presence of an expired one. Expired, spent, and revoked tokens are indistinguishable from the sweep's perspective.
- The function is pure orchestration — no business logic beyond the two-step "who to keep → clear everyone else" call. The actual email-domain state transition (`lapse` edge) lives in the users service.
- Expired sessions and one-time tokens do **not** need a sweep; they self-expire via per-row TTL in the database. Only the previous-email field requires this explicit pass.
