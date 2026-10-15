---
source: src/modules/account/services/sessions.ts
sha256: d41db69e1ba4fd96be49f07bc697fc304f2058166e0a8ea614a14a3a97f03807
generated_at: 2026-10-15T10:03:00.214317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/sessions.ts

## Purpose

Service-layer functions for a user's live sessions: listing them for the authenticated caller, preparing a metadata-only view for data export, and performing hard erasure of sessions plus verification tokens during account deletion. Credentials (refresh tokens, raw session IDs) are deliberately never returned here; the family ID is the sole handle a client can revoke by.

## Key elements

- **`sessionsList(userId, request)`** — Returns the caller's live sessions (newest first) for the *active* session mode. Delegates to `activeStrategy().list()`. The `request` argument names the caller's own session so it can be flagged `current: true`; a bare access-token caller gets `current: false` on every row.
- **`exportSessions(userId)`** — Builds an `ExportSession[]` for the data-export endpoint. Lists live rows from the repository, deduplicates to the newest per family via `newestPerFamily`, and maps to a metadata-only shape (id, createdAt, expiration, optional lastUsedAt / device). No credential fields are included.
- **`eraseSessionsAndTokens(userId, session)`** — Deletes all of the account's sessions **and** all its verification tokens inside a single Mongoose transaction (`ClientSession`). Intended as one step of a hard account-erase flow.

## Relationships

- **`../repository`** (`repository.ts`) — `exportSessions` and `eraseSessionsAndTokens` call `sessionRepository.listLive`, `sessionRepository.removeAll`, and `verificationTokenRepository.removeAll`.
- **`../session/listing`** (`listing.ts`) — `exportSessions` imports and applies `newestPerFamily` to collapse a family's multiple rows to its most recent.
- **`../session/strategy`** (`strategy.ts`) — `sessionsList` imports `activeStrategy` and the `SessionRequest` type; all listing logic is delegated to whatever strategy is currently active.
- **`services/index.ts`** — Barrel file that re-exports the three functions above for route handlers and other modules.
- **`module.ts`** — Account module wiring that connects these services to the `GET /account/sessions` route and related endpoints.
- **`@types`** (`types/index.ts`) — Source of the `Session` and `ExportSession` return types.
- **`tests/integration/auth-storage.test.ts`** — Integration tests that exercise these functions (listing, export shape, erasure).

## Notes

- **Credential hygiene is a hard invariant.** The file's doc comment states that a live refresh token or session ID "is as good as a password." Only `familyId` (as a string) appears in any returned data.
- **Strategy indirection.** `sessionsList` does not list sessions directly; it hands off to `activeStrategy()`. Behavior (what counts as a "session," how credentials are resolved from the request) changes with the active strategy.
- **Export deduplication.** `newestPerFamily` means the export contains at most one entry per session family, not one per raw row.
- **Transactional erasure.** `eraseSessionsAndTokens` accepts a Mongoose `ClientSession`; callers must join both deletes to the same transaction to keep the erasure atomic.
- **`current` flag semantics.** If the caller authenticated without a session (e.g., a bare access token), there is no "own" session to mark, so every row honestly reports `current: false`.
