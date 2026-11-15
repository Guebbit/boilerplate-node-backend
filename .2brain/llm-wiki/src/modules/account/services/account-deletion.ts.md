---
source: src/modules/account/services/account-deletion.ts
sha256: 38d018becdeea9cf54c9987d5dcc1831fedfeec0bbd2b84370116a6253c93358
generated_at: 2026-11-14T18:41:31.115502+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/account-deletion.ts

## Purpose

Implements the self-deletion-with-grace workflow: `DELETE /account` locks the account and schedules erasure at `purgeAt`; the owner can cancel via a mailed restore link or by signing in; a separate purge job (`./purge-deletions`) performs the actual erase. Staff cancel through the `users` module, and this module reacts via a `user.deletion_canceled` event.

## Key elements

- **`AccountDeletionSchedule`** — interface returned by the schedule call (`requestedAt`, `purgeAt`).
- **`RestoreVia`** — union `'link' | 'sign-in'` identifying how the owner canceled.
- **`scheduleAccountDeletion(user, context)`** — locks the account (with erasure-ledger row in the same transaction), revokes all sessions, mints a restore token, records audit/analytics/metric, and mails the restore link.
- **`restoreWrites(user, restoredAt)`** — curried transaction writer: clears the lock and records a cancellation in the erasure ledger atomically. Returns `boolean` (whether *this* call won the race).
- **`finishRestore(user, via, context)`** — post-commit housekeeping: removes live restore tokens, then calls `announceRestored`.
- **`announceRestored`** *(private)* — single point for audit row, analytics event (suppressed for staff), metric increment, and the "account restored" email.
- **`restoreAccountByLink(token, context)`** — `POST /account/restore` handler; redeems the token and applies `restoreWrites` in one transaction, then runs `finishRestore`.
- **`handleRestoredByStaff(userId, canceledAt)`** — event-driven: drops the restore token, records ledger cancellation, and mails the owner (guards against the account already being erased).

## Relationships

- **`src/modules/account/services/erasure-ledger.ts`** — `recordSchedule` joins the lock transaction; `recordCancellation` joins the restore transaction.
- **`src/modules/account/services/revocation.ts`** — `revokeFor('deletion-scheduled', …)` ends all live sessions after the lock commits.
- **`./tokens`** (imported as `./tokens`) — `issueToken`, `redeemLiveToken`, `removeTokens` manage the restore-link token lifecycle.
- **`src/modules/account/services/mail.ts`** — `sendAccountMail` dispatches both the scheduled-deletion and restored emails (fire-and-forget).
- **`src/modules/account/emails.ts`** — `deletionScheduledEmail`, `accountRestoredEmail`, `greetableName`, `recipientLocale` build the message bodies.
- **`src/modules/account/config.ts`** — `deletionPurgeAt(requestedAt)` computes the grace deadline.
- **`src/modules/account/analytics.ts` / `src/modules/account/audit.ts` / `src/modules/account/metrics.ts`** — event names, audit action constants, and the `authAccountDeleteTotal` counter.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `ResponseReject` shape the HTTP replies.
- **`src/infrastructure/observability/analytics/index.ts` / `src/infrastructure/observability/audit.ts`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit`.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` provides the caller context for the staff path.
- **`src/modules/account/module.ts`** — wires these exports into the module's route/event registration.
- **`src/modules/account/services/deletion-sign-in.ts`** — the sign-in cancellation path (separate file) also invokes `restoreWrites` + `finishRestore`.
- **`src/modules/account/services/index.ts`** — re-exports for consumers.

## Notes

- **Token ordering is load-bearing.** In `scheduleAccountDeletion` the lock/epoch save → `revokeFor` → `issueToken` sequence ensures the bulk token purge from revocation cannot delete the freshly-minted restore token.
- **Mail failure is non-fatal.** If `sendAccountMail` fails the lock remains; the owner recovers by signing in (handled in `deletion-sign-in.ts`).
- **`restoreWrites` does not sign in or revive sessions.** The session epoch advanced at lock time stays advanced; the caller must authenticate separately.
- **`finishRestore` is post-commit.** Token removal and the "restored" mail run *after* the transaction commits, so a rollback leaves the token live for a retry.
- **Staff path suppresses analytics.** `announceRestored` skips `emitAnalyticsEvent` when `via === 'staff'`, but still writes audit, metric, and email.
- **`handleRestoredByStaff` tolerates a missing user.** If the purge ran before the event was handled, `getById` returns `null` and the mail step is skipped silently.
- **Ledger atomicity.** Both `recordSchedule` and `recordCancellation` receive the Mongoose `ClientSession` so the ledger row commits or rolls back with the account state.
