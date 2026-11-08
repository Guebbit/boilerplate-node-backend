---
source: src/modules/account/services/account-deletion.ts
sha256: 4364460b75d00536f54c34cb3df411774a78ea2ad85b7230be18cbbf15e87c6a
generated_at: 2026-11-08T04:16:12.396821+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/account-deletion.ts

## Purpose

Service layer for the self-deletion lifecycle: scheduling an account erasure with a grace period, canceling it (owner link, owner sign-in, or staff via `users`), and announcing the cancellation. Implements `DELETE /account`, `POST /account/restore`, and the event handler for staff-initiated restores.

## Key elements

- **`AccountDeletionSchedule`** — interface returned to the caller: `requestedAt` (lock time) and `purgeAt` (erasure deadline).
- **`RestoreVia`** — union type `'link' | 'sign-in'` distinguishing the two owner-initiated cancel paths.
- **`scheduleAccountDeletion(user, context)`** — locks the account in one save (alongside the ledger row), revokes all sessions, mints a restore token, fires audit/analytics/metrics, and mails the restore link. Returns the schedule dates.
- **`restoreAccount(user, via, context)`** — clears the lock and drops the live restore token in one transactional save. Returns `false` if the grace has already expired. Does **not** sign in or revive sessions.
- **`announceRestored(user, via, context)`** — single funnel for the post-restore side effects: audit row, analytics event (skipped for staff), metric increment, and confirmation email. Shared by all three cancel paths.
- **`restoreAccountByLink(token, context)`** — handler for `POST /account/restore`: redeems the mailed token, calls `restoreAccount('link')`, and shapes an HTTP success or 422.
- **`handleRestoredByStaff(userId, canceledAt)`** — event handler for `user.deletion_canceled`: drops the token, records the ledger cancellation (using the event's timestamp, not a fresh `Date()`), and calls `announceRestored` with `via: 'staff'`.

## Relationships

- **`./erasure-ledger`** — `recordSchedule` and `recordCancellation` run inside the same DB transaction as the lock/restore save (callback passed to `userService`).
- **`./revocation`** — `revokeFor('deletion-scheduled', userId)` kills all active sessions when scheduling.
- **`./mail`** — `sendAccountMail` delivers the deletion-scheduled and restored emails (fire-and-forget).
- **`./deletion-sign-in.ts`** — calls `restoreAccount` with `via: 'sign-in'` when the owner signs in during the grace window.
- **`./index.ts`** — barrel re-export for the account services package.
- **`../config`** — `deletionPurgeAt(requestedAt)` computes the grace deadline.
- **`../emails`** — builds the scheduled/restored mail bodies and resolves recipient locale and greeting name.
- **`../analytics` / `../audit` / `../metrics`** — provide the named event/action/counter constants used in audit, analytics, and metric calls.
- **`@infrastructure/http/response`** — `generateSuccess` and `ResponseReject` shape the link-restore HTTP response.
- **`@infrastructure/observability/analytics` / `audit`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit` for observability.
- **`@kernel/permissions`** — `systemCallerContext('User')` fabricates the caller for the staff event handler.

## Notes

- **Order is load-bearing in `scheduleAccountDeletion`:** lock + ledger commit together → revoke sessions → mint the new token. Minting *after* revocation ensures the old-link purge can't delete the freshly issued restore token.
- **Failure mode:** if anything fails after the lock save, the account is locked but no link was mailed. The owner can still cancel by signing in (handled in `deletion-sign-in.ts`).
- **Restore ≠ sign-in:** `restoreAccount` clears the lock but does not restore the session epoch; the user must authenticate again.
- **`handleRestoredByStaff` uses the event's `canceledAt`,** not `new Date()`, so a retried event handler doesn't re-date the ledger row.
- **`sendAccountMail` is intentionally fire-and-forget** (eslint-disabled floating promise); `enqueueEmail` logs its own failures.
- **`announceRestored` suppresses the analytics event for `via: 'staff'`**, since staff actions are tracked in the `users` module's own audit row.
