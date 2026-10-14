---
source: src/modules/account/services/revocation.ts
sha256: 960ec66e9755ca13fc7a537b0d04dda02c0126484bdf3fb5240bcb8382bb3c89
generated_at: 2026-10-14T08:53:16.856656+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/revocation.ts

## Purpose

Centralises the "end a user's sessions" operation. Given a `RevocationCause` (defined in the domain's `REVOCATION` table), it moves the session epoch to invalidate live ACCESS tokens and then cleans up session rows and pending one-time tokens. All causes funnel through `revokeFor`, so callers only need to supply the reason.

## Key elements

- **`revokeFor(cause, userId)`** — exported entry point. Sequences `moveEpoch` → `settle`.
- **`moveEpoch(cause, userId)`** — bumps the session epoch via `userService.bumpSessionEpoch`. If the cause is `with-write`, it is a no-op (the caller already moved the epoch). If the cause announces, the `ACCOUNT_SESSIONS_REVOKED` outbox row is written in the *same* transaction via `announceInTransaction`.
- **`settle(cause, userId)`** — deletes session rows (`sessionRepository.removeAll`) and, when the cause purges pending tokens, calls `removeTokens`. Failures are logged as warnings and swallowed; the epoch has already moved so the revocation is effective.
- **`sessionsRevokedAnnouncement(userId, reason)`** — builds the `OutboxAnnouncement` payload for the `ACCOUNT_SESSIONS_REVOKED` event.
- **`PENDING_TOKEN_TYPES`** — explicit allowlist of one-time token kinds (`password-reset`, `email-verify`, `email-change`, `account-delete`, `mfa-challenge`) that are purged on revocation. New token types must be added here to be included.

## Relationships

- **`../domain/revocation.ts`** — source of the `REVOCATION` table (epoch mode, `pending` flag, announce flag), the `announces()` helper, and the `RevocationCause` / `SessionsRevokedReason` types.
- **`../token-types.ts`** — provides the token-type constants and `VerificationTokenType` used in `PENDING_TOKEN_TYPES`.
- **`../repository.ts`** — `sessionRepository.removeAll` for deleting session rows.
- **`./tokens.ts`** — `removeTokens` for purging pending one-time tokens.
- **`../events.ts`** — `ACCOUNT_SESSIONS_REVOKED` event name.
- **`@kernel/outbox`** — `announceInTransaction` for writing the outbox row atomically with the epoch bump.
- **`@modules/users`** — `userService.bumpSessionEpoch` performs the actual epoch write.
- **`@infrastructure/adapters/logger`** — `logger.warn` on non-fatal cleanup failures in `settle`.
- **Caller services** (`./logout.ts`, `./password.ts`, `./two-factor-enrollment.ts`, `./verification.ts`) — invoke `revokeFor` with their specific cause; some (e.g. password reset) pre-move the epoch in their own write and then call `revokeFor` for cleanup only.

## Notes

- **The epoch is the guarantee.** Row and link deletion in `settle` is best-effort housekeeping; a failure there does not undo the revocation because the epoch already rejects old tokens.
- **`with-write` causes** skip the epoch bump inside `revokeFor`. The calling service is responsible for having moved the epoch in its own transaction before calling `revokeFor`.
- **`PENDING_TOKEN_TYPES` is an opt-in list.** Adding a new one-time token type does *not* automatically make it subject to purge-on-revocation. The email-change undo token is deliberately excluded because it is already spent by the time its cause executes.
- Announcing causes write the outbox row in the same transaction as the epoch bump, so subscribers (e.g. `api-keys`) see the event atomically with the state change; the relay retries on subscriber failure rather than dropping the event.
