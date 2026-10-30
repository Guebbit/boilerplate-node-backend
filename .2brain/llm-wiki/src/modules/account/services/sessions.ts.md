---
source: src/modules/account/services/sessions.ts
sha256: ec630a1fe677b380d8b52620b6b60686f6b971dcacd2f8e339ed5be5bcc7d899
generated_at: 2026-10-29T02:44:47.847154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/sessions.ts

## Purpose

Service layer for the account's session data: listing the caller's live sessions, fetching a single one, preparing credential-free rows for the data export, and performing the hard erasure (sessions + one-time verification tokens) that is part of account deletion. It deliberately never returns a live credential (refresh token or session id) outside the listing endpoints.

## Key elements

- **`sessionsList(userId, request)`** — Returns the caller's live sessions for the *active* auth mode, newest sign-in first. Delegates to `activeStrategy().list()`; the `SessionRequest` lets the current row be flagged `current`.
- **`sessionGet(userId, sessionId, request)`** — Convenience wrapper that calls `sessionsList` and finds the matching id. Returns `undefined` for non-existent or non-owned sessions.
- **`exportSessions(userId)`** — Builds the data-export payload: deduplicates by family via `newestPerFamily`, then maps each row through `presentExportSession`. Metadata only — no credentials.
- **`eraseSessionsAndTokens(userId, session: ClientSession)`** — Deletes all of the account's sessions and its one-time verification tokens. Both removes run inside the caller-supplied Mongoose transaction so they are atomic with the rest of the erasure.

## Relationships

- **`src/modules/account/repository.ts`** — Provides `sessionRepository` (list / remove) and `verificationTokenRepository` (remove) used by the export and erase paths.
- **`src/modules/account/session/strategy.ts`** — Supplies `activeStrategy()` (mode-specific list + `credentialOf`) and the `SessionRequest` type; the file never touches mode logic directly.
- **`src/modules/account/session/listing.ts`** — `newestPerFamily` deduplicates session rows before export.
- **`src/modules/account/presenter.ts`** — `presentExportSession` shapes a raw repository row into the public `ExportSession` type.
- **`src/types/index.ts`** — Source of the `Session` and `ExportSession` types in the return signatures.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports the four functions so the module can import them by name.
- **`src/modules/account/module.ts`** — Wires these services into the HTTP handlers / routing.
- **`src/modules/account/tests/integration/auth-storage.test.ts`** — Integration tests that exercise the listing, get, and erase paths end-to-end.

## Notes

- `sessionGet` is implemented as *list-all-then-filter*; there is no dedicated single-row lookup in the repository layer.
- A caller who authenticated with a bare access token (no session) will see every row as `current: false` — the `credentialOf(request)` lookup simply yields nothing to match.
- The erase function accepts a Mongoose `ClientSession` and is expected to be called *inside* an outer transaction; it does not begin or commit one itself.
- The file's doc block makes the security intent explicit: the family id is the revocation handle; the actual credential is never part of the export or any non-listing output.
