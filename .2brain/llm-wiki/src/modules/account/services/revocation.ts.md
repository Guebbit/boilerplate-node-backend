---
source: src/modules/account/services/revocation.ts
generated_at: 2026-11-22T03:41:43.778057+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/revocation.ts

## Purpose
Single place where an account's sessions are ended. `revokeFor` takes a `RevocationCause` and uses the `REVOCATION` table (`src/modules/account/domain/revocation.ts`) to decide what the cause moves (the session epoch), purges (session rows, pending one-time links) and announces (an outbox event). Moving the epoch is what matters, since it also invalidates live ACCESS tokens. The row and link deletion afterwards is housekeeping.

## Key elements
- `revokeFor(cause, userId)`: the entry point. Runs `moveEpoch`, then `settle`.
- `sessionsRevokedAnnouncement(userId, reason)`: builds the `account.sessions_revoked` outbox announcement (`ACCOUNT_SESSIONS_REVOKED`, payload `{ userId, reason }`, `aggregateId: userId`). Exported so other code can build the same row.
- `moveEpoch` (private):
  - If the cause's `epoch` is `'with-write'`, it does nothing, because the caller's own credential write already moved the epoch.
  - If the cause doesn't announce, it calls `accountUserService.bumpSessionEpoch(userId)`.
  - If the cause announces, it bumps the epoch and writes the announcement in the same transaction via `announceInTransaction`.
- `settle` (private): deletes all session rows with `sessionRepository.removeAll`. If the cause has `pending`, it also removes the one-time tokens in `PENDING_TOKEN_TYPES` via `removeTokens`. Failures are caught and logged with `logger.warn`, not rethrown.
- `PENDING_TOKEN_TYPES` (private): the token kinds purged for `pending` causes: password reset, email verify, email change, MFA challenge, deletion restore.

## Relationships
- `src/modules/account/domain/revocation.ts`: supplies `REVOCATION`, `announces`, `RevocationCause` and `SessionsRevokedReason`, which drive all branching here.
- `src/modules/users/friends/account.ts`: `accountUserService.bumpSessionEpoch` does the actual epoch bump, optionally inside a given transaction session.
- `src/kernel/outbox.ts`: `announceInTransaction` and the `OutboxAnnouncement` type carry the announcement.
- `src/modules/account/events.ts`: provides the `ACCOUNT_SESSIONS_REVOKED` event name.
- `src/modules/account/repository.ts`: `sessionRepository.removeAll` deletes the session rows.
- `src/modules/account/services/tokens.ts`: `removeTokens` deletes the pending links.
- `src/modules/account/token-types.ts`: provides the token type constants and the `VerificationTokenType` type.
- `src/infrastructure/adapters/logger.ts`: logs the housekeeping failure warning.
- Sibling services (`logout`, `password`, `account-deletion`, `two-factor-enrollment`, `verification`), `session/jwt.ts` and `module.ts` are graph neighbors. This file does not import them, so only a general relationship is visible here: the doc comments say causes that write their own credential (`with-write`) call `revokeFor` after that write.

## Notes
- Failures in `settle` are swallowed (logged only). The epoch has already moved and refuses old tokens, so the change is not reported as failed. Errors from `moveEpoch` do propagate.
- `PENDING_TOKEN_TYPES` is an explicit allow-list, so new token kinds must opt in to being purged.
- The email-change undo token is deliberately left out. Its own flow ends the sessions first and spends the link afterwards in the restore's transaction, so purging it here would kill the link before its action ran.
- In the announcing path, `announceInTransaction`'s write returns the `userId`, because a write that resolves to nothing announces nothing. Because the announcement is in the same transaction, a failing subscriber is retried by the relay rather than skipped.
- The module doc comment points to a `#revocation` section of an account-sessions doc.
