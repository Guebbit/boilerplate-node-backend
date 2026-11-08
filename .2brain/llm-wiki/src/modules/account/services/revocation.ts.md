---
source: src/modules/account/services/revocation.ts
sha256: 70e7f1eae3b8e5419489bc87ce7eae22d6a87f1722bc4277cb331a5d9b417dd8
generated_at: 2026-11-08T04:22:46.617682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/revocation.ts

## Purpose

Single entry point (`revokeFor`) for ending a user's sessions. Given a `RevocationCause` from the domain table, it decides whether to bump the session epoch (the step that actually invalidates live ACCESS tokens) and then performs the housekeeping of deleting session rows and optional pending-token links. Every call-site that ends sessions funnels through this one function so the epoch/announce/delete ordering is handled in one place.

## Key elements

- **`revokeFor(cause, userId)`** — Public entry point. Runs `moveEpoch` then `settle` sequentially.
- **`sessionsRevokedAnnouncement(userId, reason)`** — Builds the `OutboxAnnouncement` for `ACCOUNT_SESSIONS_REVOKED`; used inside the epoch transaction so subscribers (`api-keys`) hear of revocation atomically with the epoch bump.
- **`PENDING_TOKEN_TYPES`** — Opt-in list of one-time token types a "pending" cause purges (password-reset, email-verify, email-change, MFA-challenge, deletion-restore). New token types must be added explicitly; the email-change undo token is deliberately excluded.
- **`moveEpoch(cause, userId)`** — Bumps the session epoch via `userService.bumpSessionEpoch`. For announcing causes, the outbox row is written in the *same* transaction via `announceInTransaction`. No-ops when the cause's epoch strategy is `with-write`.
- **`settle(cause, userId)`** — Deletes session rows (`sessionRepository.removeAll`) and, when the cause specifies it, pending token links (`removeTokens`). Failures are logged at `warn` level and **not** re-thrown.

## Relationships

- **`domain/revocation.ts`** — Source of the `REVOCATION` table (per-cause epoch strategy, pending flag) and the `announces()` helper. This file interprets the table; the domain defines it.
- **`kernel/outbox.ts`** — `announceInTransaction` provides the same-transaction write of the outbox row alongside the epoch bump.
- **`events.ts`** — Supplies the `ACCOUNT_SESSIONS_REVOKED` event name and its payload shape.
- **`repository.ts`** — `sessionRepository.removeAll(userId)` performs the row deletion in `settle`.
- **`services/tokens.ts`** — `removeTokens(userId, PENDING_TOKEN_TYPES)` deletes the pending one-time-token links.
- **`token-types.ts`** — Provides the five `VerificationTokenType` constants used in `PENDING_TOKEN_TYPES`.
- **`@modules/users` (`userService`)** — `bumpSessionEpoch` is the actual epoch write.
- **`@infrastructure/adapters/logger`** — `logger.warn` for non-fatal cleanup failures in `settle`.
- **Callers** (reverse dependency): `account-deletion.ts`, `logout.ts`, `password.ts`, `two-factor-enrollment.ts`, `verification.ts`, `session/jwt.ts`, and `module.ts` all invoke `revokeFor` to end sessions for their respective causes.

## Notes

- The **epoch bump is the critical step**; it is what invalidates live ACCESS tokens. Row/link deletion is cleanup that can fail without undoing the revocation.
- Causes with `epoch: 'with-write'` (e.g., password change) bump the epoch inside their own write path and call `revokeFor` afterward purely for the housekeeping (`settle`). `moveEpoch` detects this and no-ops.
- `settle` swallows errors (logs `warn` only). Rationale: the epoch has already moved, so the user is already logged out; a failed `DELETE` is retryable and not a user-facing failure.
- `PENDING_TOKEN_TYPES` is intentionally **not** "all token types." Adding a new one-time token type requires an explicit opt-in here if it should be purged on revocation.
- For announcing causes, the outbox row and the epoch bump are in the **same database transaction**; a downstream subscriber failure is handled by the relay's retry, not by this module.
