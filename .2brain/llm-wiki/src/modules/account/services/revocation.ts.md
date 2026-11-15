---
source: src/modules/account/services/revocation.ts
sha256: a788cf348e4230e47b0d06a6c2037b017ae217dd318facbd72bb25829671670e
generated_at: 2026-11-14T18:51:02.892831+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/revocation.ts

## Purpose

Single entry point for ending an account's sessions. Given a `RevocationCause`, it decides (via the `REVOCATION` table in the domain) whether to bump the session epoch, what one-time tokens to purge, and whether to publish an `ACCOUNT_SESSIONS_REVOKED` event—then performs the row cleanup. The epoch bump is the operative step (it invalidates live ACCESS tokens); the deletion that follows is housekeeping.

## Key elements

- **`revokeFor(cause, userId)`** (export) — The public API. Orchestrates `moveEpoch` then `settle`. Called by other services (account-deletion, logout, password, two-factor-enrollment, verification) after their own write has landed.
- **`sessionsRevokedAnnouncement(userId, reason)`** (export) — Builds the `OutboxAnnouncement` payload for `ACCOUNT_SESSIONS_REVOKED`; consumed by subscribers (e.g. `api-keys`).
- **`moveEpoch`** (internal) — If the cause's epoch strategy is `'with-write'`, does nothing (the caller already bumped it). Otherwise bumps via `accountUserService.bumpSessionEpoch`, and if the cause announces, does so inside the same transaction via `announceInTransaction` so subscribers see the event atomically with the epoch change.
- **`settle`** (internal) — Deletes all session rows (`sessionRepository.removeAll`) and, when the cause marks `pending`, removes the curated set of one-time tokens via `removeTokens`. Failures are logged (`logger.warn`) but **not** re-thrown, because the epoch has already moved and the revocation is effective.
- **`PENDING_TOKEN_TYPES`** (internal constant) — Explicit allow-list of token kinds purged by `pending` causes. New token types must be added here to be included.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — Source of truth: the `REVOCATION` table defines per-cause `epoch` strategy, `pending` flag, and `announces` predicate. This file is a pure executor of that table.
- **`src/modules/account/events.ts`** — Provides `ACCOUNT_SESSIONS_REVOKED`, the event name stamped on the outbox row.
- **`src/kernel/outbox.ts`** — `announceInTransaction` guarantees the event is written in the same DB transaction as the epoch bump.
- **`src/modules/users/friends/account.ts`** — `accountUserService.bumpSessionEpoch` performs the actual epoch write (owned by the users module).
- **`src/modules/account/services/tokens.ts`** — `removeTokens` deletes one-time verification/challenge rows.
- **`src/modules/account/token-types.ts`** — Enumerates the token-type constants used in `PENDING_TOKEN_TYPES`.
- **`src/modules/account/repository.ts`** — `sessionRepository.removeAll` deletes session rows.
- **`src/infrastructure/adapters/logger.ts`** — Emits the `warn` on `settle` failure.
- **`src/modules/account/services/account-deletion.ts`, `src/modules/account/services/logout.ts`, `src/modules/account/services/password.ts`, `src/modules/account/services/two-factor-enrollment.ts`, `src/modules/account/services/verification.ts`** — Upstream callers that invoke `revokeFor` with a specific cause after their own domain write.

## Notes

- **Opt-in purge list.** `PENDING_TOKEN_TYPES` is deliberately exhaustive. The email-change undo token is *excluded on purpose*: its flow ends sessions first, then spends the link in the restore transaction; purging it here would destroy the link before its action ran. Any new one-time token kind must be explicitly added here if it should be purged on revocation.
- **`settle` never rejects.** A DB failure during row/token deletion is logged at `warn` level and swallowed. The epoch bump has already succeeded, so the revocation is functionally complete; the rows are stale but harmless (epoch check rejects them).
- **`'with-write'` epoch strategy.** Causes that bump the epoch as part of their own domain write (e.g. password change) skip the `moveEpoch` step here and call `revokeFor` *after* their write, relying on it only for `settle`.
- **Transactional announcement.** Announcing causes use `announceInTransaction` so the outbox row and the epoch bump commit atomically; a downstream subscriber failure is retried by the relay, not lost.
