---
source: src/modules/account/services/sessions.ts
sha256: 0db2b6b394a5ad207ebd308e741e1e5df1fb259e198a2a50d01c3e90a74084c0
generated_at: 2026-10-14T08:53:51.414424+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/sessions.ts

## Purpose

Exposes the caller's own live sessions (as `GET /account/sessions` would), the data-export representation of those sessions, and the hard-erasure path that wipes session and verification-token data during account deletion. A deliberate invariant: no credential (refresh token, session id) is ever returned by any function in this file — the family id is the handle a client uses for revocation.

## Key elements

- **`sessionsList(userId, request)`** — Returns the authenticated user's live sessions of the active mode, newest sign-in first. Uses `activeStrategy()` to delegate listing; the `SessionRequest` parameter lets the strategy mark the caller's own row as `current`. A caller with no session context (bare access token) gets every row as `current: false`.
- **`exportSessions(userId)`** — Returns metadata-only `ExportSession[]` for data export. Deduplicates to one row per family via `newestPerFamily`, maps Mongoose rows to a flat DTO, and conditionally includes `lastUsedAt` and `device`. No credential fields are present.
- **`eraseSessionsAndTokens(userId, session)`** — Deletes all session rows and all one-time verification-token rows for the account. Both deletes join the caller-supplied Mongoose `ClientSession` transaction so the erasure is atomic.

## Relationships

- **`src/modules/account/repository.ts`** — Source of `sessionRepository` and `verificationTokenRepository`; all persistent reads/writes go through these.
- **`src/modules/account/session/config.ts`** — Provides `getSessionMode()`, which selects the active session mode for `exportSessions`.
- **`src/modules/account/session/listing.ts`** — Provides `newestPerFamily`, used to collapse session rows to one per family before export.
- **`src/modules/account/session/strategy.ts`** — Provides `activeStrategy()` and the `SessionRequest` type; `sessionsList` delegates its listing entirely to the strategy.
- **`src/types/index.ts`** — Source of the `Session` and `ExportSession` DTO types returned by the public functions.
- **`src/modules/account/module.ts`**, **`src/modules/account/services/index.ts`** — Reverse dependencies that register/re-export these functions into the account module's HTTP surface.
- **`src/modules/account/tests/integration/auth-storage.test.ts`** — Integration tests that exercise these three exports.

## Notes

- The `request` parameter on `sessionsList` is a `SessionRequest`, **not** a full HTTP request — the strategy interprets it to find the caller's session. Passing `null`/absent context is valid and simply means no row is marked current.
- `eraseSessionsAndTokens` expects the **caller** to own the Mongoose transaction; it does not create or commit one. Forgetting to pass a real `ClientSession` (or the wrong one) breaks the atomicity contract.
- `exportSessions` omits `lastUsedAt` and `device` keys entirely when they are absent (spread with a ternary), so downstream consumers must treat both as optional.
