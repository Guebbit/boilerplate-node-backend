---
source: src/modules/account/services/account-deletion.ts
source_sha256: 1ea6af090f06caeffa93206eb4550d3e07cf83bf768f0573a8f40e50ae191d87
context_sha256: 05553f1a0dccc61ac4424781637dcb8cd36dec4789af18a3af22b0bd18f6a1d9
generated_at: 2026-11-22T03:35:30.535009+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/account-deletion.ts

## Purpose
Implements self-deletion with a grace period for the account module. The owner's `DELETE /account` locks the account and promises erasure at `purgeAt`; a mailed link or a sign-in cancels it, and `./purge-deletions` performs the erasure. Staff cancel through the `users` module, and `account` learns of it via an event.

## Key elements
- `AccountDeletionSchedule` – `{ requestedAt, purgeAt }`, what `DELETE /account` answers.
- `RestoreVia` – `'link' | 'sign-in'`, how the owner canceled.
- `scheduleAccountDeletion(user, context)` – computes `purgeAt` via `deletionPurgeAt`, then calls `accountUserService.scheduleOwnDeletion`. The erasure-ledger row (`recordSchedule`) is written in the same transaction. Afterwards it revokes sessions (`revokeFor('deletion-scheduled', …)`) and issues a restore token whose lifetime runs until `purgeAt`. It then records the audit, analytics and metric, and sends an urgent mail with the restore link (fire-and-forget).
- `restoreWrites(user, restoredAt)` – returns a `(session) => Promise<boolean>` write for a transaction that also spends the proof (link or sign-in claim). It clears the lock via `restoreOwnAccount` and records the cancellation in the ledger. It resolves `false` if the grace ran out or another restore won. Marked `@internal`: it does no check of who asks.
- `finishRestore(user, via, context)` – after the commit, removes live restore tokens, then announces the restore.
- `restoreAccountByLink(token, context)` – `POST /account/restore`. Spends the token and restores in one transaction via `redeemLiveToken`. It returns a 200 success, or a refusal through `refuseLink` (`account.delete.token-not-found`, 422 per the docs) for an unknown, expired, spent or too-late link. It does not sign in.
- `handleRestoredByStaff(userId, canceledAt)` – handler for the `user.deletion_canceled` event. It removes restore tokens, records the cancellation in the ledger, then fetches the user and announces the restore with a `systemCallerContext('User')` caller if the user still exists.
- `announceRestored` (private) – the shared trail for all restores: audit row, analytics event (skipped for `staff`), `canceled` metric, and a restored mail.

## Relationships
- `@modules/users` / `@modules/users/friends/account` – `accountUserService` performs the actual lock, unlock and user lookup. `UserDocument` is the user type.
- `./erasure-ledger` – `recordSchedule` and `recordCancellation` keep the erasure ledger in step with lock and restore.
- `./revocation` – `revokeFor` ends sessions when a deletion is scheduled.
- `./tokens` – `issueToken`, `redeemLiveToken`, `refuseLink` and `removeTokens` manage restore-link tokens (`ACCOUNT_RESTORE_TOKEN_TYPE` from `../token-types`).
- `./mail` and `../emails` – `sendAccountMail` sends mails built by `deletionScheduledEmail`, `accountRestoredEmail`, `greetableName` and `recipientLocale`.
- `../config` – `deletionPurgeAt` computes the erasure date.
- `../audit`, `../analytics`, `../metrics` – account audit actions, analytics events and the `authAccountDeleteTotal` counter. They are emitted through `@infrastructure/observability/audit` (`recordAudit`) and `@infrastructure/observability/analytics`.
- `@infrastructure/http/response` – `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types.
- `@kernel/permissions` – `systemCallerContext` for the staff-restore path.
- `./deletion-sign-in` – the sign-in restore path, where `RestoreVia` `'sign-in'` and `restoreWrites` apply. This file does not import it.
- `./index` and `../module` – wiring and exports. This file does not import them.

## Notes
- Order in `scheduleAccountDeletion` matters. The lock and session epoch are saved first, then old links are revoked, then the restore link is minted, so the revocation cannot kill the new link. A failure after the lock leaves a locked account with no mailed link. The owner can still restore by signing in.
- Restoring does not sign anyone in or revive sessions; the epoch moved at lock time stays.
- Mails are sent with `void sendAccountMail(...)`. The code comments say it never rejects. Only the schedule mail is `urgent`.
- Mail locale prefers the recipient's own locale, and falls back to the request's.
- `restoreWrites` does not verify the caller. The caller must have already verified the link or the claim.
- `handleRestoredByStaff` takes `canceledAt` from the event so a retried handler does not re-date the cancellation. If the account was already erased, nobody is mailed. `users` holds the staff audit row.
