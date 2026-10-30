---
source: src/modules/account/services/revocation.ts
sha256: 3bbfaf1886cb94bec5c313e7646023ff97fbabd3051f1850ae4183d682483134
generated_at: 2026-10-29T02:44:35.070618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/revocation.ts

## Purpose

Single entry point for ending all of an account's live sessions. It reads a `REVOCATION` cause table (defined in `../domain/revocation.ts`) to decide *what* to do—bump the session epoch, purge pending one-time tokens, and/or announce the event—so that every caller (logout, password change, 2FA enrollment, account deletion, etc.) shares identical semantics instead of each re-implementing the sequence.

## Key elements

- **`revokeFor(cause, userId)`** (exported) — The public API. Orchestrates `moveEpoch` → `settle` in sequence. A cause with `epoch: 'with-write'` expects the *caller* to have already bumped the epoch; this function then only runs `settle`.
- **`sessionsRevokedAnnouncement(userId, reason)`** (exported) — Builds the `ACCOUNT_SESSIONS_REVOKED` outbox payload. Used by `moveEpoch` when the cause announces, and available to any caller that needs to craft the same row.
- **`moveEpoch(cause, userId)`** (private) — Bumps the session epoch via `userService.bumpSessionEpoch`. If the cause announces, it does so in the *same* transaction via `announceInTransaction` so subscribers see the event atomically with the epoch change.
- **`settle(cause, userId)`** (private) — Deletes session rows (`sessionRepository.removeAll`) and, when the cause purges pending tokens, removes the listed one-time tokens. Failures here are **logged as warnings, not thrown**, because the epoch has already invalidated all tokens.
- **`PENDING_TOKEN_TYPES`** (private const) — Explicit allowlist of `VerificationTokenType` values that a `pending`-purging cause will delete. New token kinds must opt in; the email-change undo token is intentionally excluded.

## Relationships

- **`../domain/revocation.ts`** — Source of the `REVOCATION` table, `announces()` helper, and the `RevocationCause` / `SessionsRevokedReason` types. This file is a pure consumer of that table.
- **`../events.ts`** — Provides `ACCOUNT_SESSIONS_REVOKED`, the event name stamped on the outbox row.
- **`../repository.ts`** — `sessionRepository.removeAll` is called during `settle`.
- **`./tokens.ts`** — `removeTokens` is called during `settle` for pending one-time token cleanup.
- **`../token-types.ts`** — Supplies the token-type constants and `VerificationTokenType` used in `PENDING_TOKEN_TYPES`.
- **`@modules/users`** — `userService.bumpSessionEpoch` performs the actual epoch increment.
- **`@kernel/outbox`** — `announceInTransaction` guarantees the announcement row and the epoch bump commit atomically.
- **`@infrastructure/adapters/logger`** — Used to `warn` when `settle` housekeeping fails.
- **Callers** (`account-deletion`, `logout`, `password`, `two-factor-enrollment`, `verification`) — Each picks a `RevocationCause` and calls `revokeFor`; they do not duplicate epoch or cleanup logic.

## Notes

- **`with-write` vs. owned epoch:** Some causes (e.g. password change) bump the epoch as part of their own credential write. For those, `moveEpoch` is a no-op and the caller invokes `revokeFor` *after* its write. All other causes delegate the bump to this module.
- **`settle` is best-effort:** It intentionally swallows errors (warn-log only) because the security-critical step—epoch bump—has already completed. A stuck row is a cleanup problem, not a session-leak.
- **`PENDING_TOKEN_TYPES` is an allowlist, not a wildcard:** Adding a new `VerificationTokenType` does *not* automatically make it subject to purge. You must add it here if the cause should kill it.
- **Announcement atomicity:** When a cause announces, the outbox row is written in the same DB transaction as the epoch bump. A relay retry covers downstream subscriber failures; the event is never silently skipped.
