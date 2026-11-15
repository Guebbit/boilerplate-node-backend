---
source: src/modules/account/services/previous-email-cleanup.ts
sha256: 9977a2bbd34690f761e2db20b8e65d436a43c2c321e6d44b8971832309fafa81
generated_at: 2026-11-14T18:48:35.167253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/previous-email-cleanup.ts

## Purpose

Implements the nightly `reap:previous-emails` sweep: for every account whose 7-day email-change undo link is no longer live (expired, spent, or revoked), it forgets the stored previous address. This is a data-minimisation step—an old address has no purpose once nothing can restore it.

## Key elements

- **`reapLapsedPreviousEmails()`** (exported) — Returns `Promise<number>` (count of accounts cleared). Resolves the set of user IDs that still hold a live `EMAIL_CHANGE_UNDO_TOKEN_TYPE` token via the repository, then delegates to `accountUserService.clearLapsedPreviousEmail(keep)` to wipe the previous email for everyone *not* in that set.

## Relationships

- **`../repository`** — Imports `verificationTokenRepository`; calls `.userIdsWithLive(tokenType, now)` to determine which accounts must retain their previous email.
- **`../token-types`** — Imports the `EMAIL_CHANGE_UNDO_TOKEN_TYPE` constant to scope the live-token query.
- **`@modules/users/friends/account`** — Imports `accountUserService` and calls `.clearLapsedPreviousEmail(keep)` to perform the actual data clear.

## Notes

- Logic is inverted: it computes the *keep* set (users with a live undo token) and clears the complement. If the token query returns an empty set, every account is cleared.
- Only undo-token state matters here. Expired sessions and one-time tokens do **not** require a sweep—each row carries its own TTL date that the database enforces automatically, so they are out of scope for this file.
- "Lapsed" is intentionally broad: expired, spent, and revoked tokens are indistinguishable for this purpose.
