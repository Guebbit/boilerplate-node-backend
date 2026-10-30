---
source: src/modules/account/services/account-deletion.ts
sha256: c5f22cfd3a1d7bb6f8c6098eb08a9667684f8aff305ed1067f0805664349ac3e
generated_at: 2026-10-29T02:39:44.703550+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/account-deletion.ts

## Purpose

Implements the self-deletion grace flow: `DELETE /account` locks the account and schedules its erasure at a computed `purgeAt`; the owner can cancel via a one-time mailed restore link or by signing in before the deadline. Also handles staff-initiated cancellation (arriving as an event from the `users` module) and provides the shared "announce restore" trail used by all three cancellation paths.

## Key elements

- **`AccountDeletionSchedule`** (interface) — `{ requestedAt, purgeAt }`; the shape returned by `DELETE /account`.
- **`RestoreVia`** (type) — `'link' | 'sign-in'`; distinguishes how the owner cancelled (staff is a separate string in `announceRestored`).
- **`scheduleAccountDeletion(user, context)`** — orchestrates the full scheduling: lock + session-epoch save → revoke active sessions → mint the restore token → audit / analytics / metric → mail the link. Returns the schedule dates.
- **`restoreAccount(user, via, context)`** — clears the lock, removes any live restore token, calls `announceRestored`. Returns `false` if the grace has already expired.
- **`announceRestored(user, via, context)`** — single choke-point that writes the audit row, fires the analytics event, bumps the metric, and sends the confirmation email. Accepts `'link' | 'sign-in' | 'staff'`.
- **`restoreAccountByLink(token, context)`** — handler for `POST /account/restore`; redeems the token, calls `restoreAccount('link')`, or returns a 422 `refuseLink` on unknown/expired/spent token.
- **`handleRestoredByStaff(userId)`** — event-driven handler for the `user.deletion-cancelled` event from `users`; removes the (now pointless) token, fetches the user, and calls `announceRestored(..., 'staff')`. Silently no-ops if the user is already erased.

## Relationships

- **`./tokens.ts`** — issues, redeems, and removes `ACCOUNT_RESTORE_TOKEN_TYPE` tokens.
- **`./revocation.ts`** — `revokeFor('deletion-scheduled', …)` kills active sessions at schedule time.
- **`./mail.ts`** — `sendAccountMail` delivers the scheduled-deletion and restored emails (fire-and-forget).
- **`./deletion-sign-in.ts`** — consumer: the sign-in path calls `restoreAccount(user, 'sign-in', …)` when it detects a locked account.
- **`../module.ts`** — wires `restoreAccountByLink` as the `POST /account/restore` route handler and `handleRestoredByStaff` as the event subscriber.
- **`../config.ts`** — provides `deletionPurgeAt` (grace-period calculation).
- **`../emails.ts`** — builds the scheduled-deletion and restored email bodies; supplies `greetableName` / `recipientLocale`.
- **`../analytics.ts` / `../audit.ts` / `../metrics.ts`** — named event IDs, audit-action constants, and the `authAccountDeleteTotal` counter.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `ResponseReject` for the link-restore endpoint's return type.
- **`@infrastructure/observability/analytics` / `audit`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit`.
- **`@kernel/permissions`** — `systemCallerContext('User')` used as the caller in `handleRestoredByStaff`.

## Notes

- **Order in `scheduleAccountDeletion` is deliberate**: lock + epoch save → session revocation → token issuance. If a step after the lock fails, the account is locked but no link was mailed; the owner can still cancel by signing in. The token is minted *after* session revocation so the revocation pass cannot sweep the new restore token.
- **Restoring never signs in or revives a session.** The session epoch advanced at lock time is not rolled back; the owner must authenticate fresh.
- **`announceRestored` is the single source of truth** for the restore trail. All three paths (link, sign-in, staff) funnel through it so audit, analytics, metrics, and email stay consistent. Staff restores skip the analytics event but still record audit and mail.
- **`handleRestoredByStaff` tolerates a missing user.** If the purge ran before the event was processed, `getById` returns null and the function exits without error.
- **`sendAccountMail` is fire-and-forget** (`void` + eslint suppression). It enqueues internally and logs its own failures; the deletion/restore flows do not await or catch it.
