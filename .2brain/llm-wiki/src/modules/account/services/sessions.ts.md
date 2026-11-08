---
source: src/modules/account/services/sessions.ts
sha256: ec630a1fe677b380d8b52620b6b60686f6b971dcacd2f8e339ed5be5bcc7d899
generated_at: 2026-11-08T04:22:59.444462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/sessions.ts

## Purpose

Service layer for the authenticated caller's own live sessions. It exposes listing, single-session lookup, data-export, and hard-erasure operations for `GET /account/sessions` and the account-deletion flow. A hard rule governs the module: no live credential (refresh token, raw session id) is ever returned to a client—the family id is the only revocation handle that crosses the boundary.

## Key elements

- **`sessionsList(userId, request)`** – Returns the caller's live sessions (newest sign-in first) via the active session strategy. The `request` argument lets the current row be flagged `current: true`; a bare-token caller has no session of their own, so every row is `current: false`.
- **`sessionGet(userId, sessionId, request)`** – Single-session lookup. Implemented as `sessionsList` + array `find`; no separate DB query. Returns `undefined` if the id doesn't belong to the caller or isn't live.
- **`exportSessions(userId)`** – Produces `ExportSession[]` for the data export. Fetches live rows, deduplicates via `newestPerFamily`, then strips credentials through `presentExportSession`.
- **`eraseSessionsAndTokens(userId, session)`** – Deletes all sessions **and** all verification tokens for the account. Both deletes join the caller's Mongoose `ClientSession` (transaction) so the erasure is atomic.

## Relationships

- **`../repository`** (`repository.ts`) – `sessionRepository.listLive` / `removeAll` and `verificationTokenRepository.removeAll` provide the data access; this file orchestrates but never touches the DB driver directly.
- **`../session/strategy.ts`** – Supplies `activeStrategy()` (the live session-strategy instance) and the `SessionRequest` type. All listing/lookup goes through the strategy, not the repository.
- **`../session/listing.ts`** – `newestPerFamily` collapses session rows to one per family before export.
- **`../presenter.ts`** – `presentExportSession` maps a raw row to the credential-free `ExportSession` shape.
- **`@types`** (`src/types/index.ts`) – Source of the `Session` and `ExportSession` contracts this file returns.
- **`../services/index.ts`** – Barrel that re-exports this module so consumers import from the services entry point.
- **`../module.ts`** – Routes/registers the exported functions as account-module endpoints.
- **`../tests/integration/auth-storage.test.ts`** – Integration tests exercising the list/get/export/erase paths end-to-end.

## Notes

- `sessionGet` does **not** issue a dedicated query; it fetches the full list and filters in memory. Fine for the expected row count, but it means a session id that was never issued will still trigger a full list fetch.
- The `request` parameter on `sessionsList` / `sessionGet` is **not** an auth check—`userId` (set by upstream middleware) is the authorization boundary. The request only carries enough context to mark the caller's own row as `current`.
- `eraseSessionsAndTokens` expects the caller to supply an **open** Mongoose transaction session; it will not begin one. Forgetting to commit/abort upstream will roll back both deletes.
- The family-id-only rule is a deliberate security invariant: treating a raw refresh token or session id as a password means it must never appear in a response body, log line, or export payload produced by this module.
