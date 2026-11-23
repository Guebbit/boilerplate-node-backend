---
source: src/modules/account/services/sessions.ts
source_sha256: ec630a1fe677b380d8b52620b6b60686f6b971dcacd2f8e339ed5be5bcc7d899
context_sha256: d16ee10204ea160228634639865bb63fa7ffd63a6b3c7e4ccfa6a56ab7d20113
generated_at: 2026-11-22T03:41:57.041048+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/sessions.ts

## Purpose
Service layer for an account's session data: listing the caller's own live sessions (as `GET /account/sessions` publishes them), exporting session metadata for the data export, and erasing sessions and one-time tokens during a hard account deletion. It never exposes credentials. A live refresh token or session id is as good as a password, so clients revoke by family id instead.

## Key elements
- `sessionsList(userId, request)`: Gets the active strategy, then calls `strategy.list(userId, strategy.credentialOf(request))`. Returns the user's live sessions of the active mode, newest sign-in first. The caller's own session is marked `current`. A caller with no session of their own (e.g. a bare access token) gets every row as `current: false`.
- `sessionGet(userId, sessionId, request)`: Finds one session by id in `sessionsList`'s result. Returns `undefined` if the session isn't the caller's, isn't live, or never existed.
- `exportSessions(userId)`: Lists live sessions through `sessionRepository.listLive`, keeps the newest per family via `newestPerFamily`, and maps each row with `presentExportSession`. Returns `ExportSession[]` (metadata only, no credentials).
- `eraseSessionsAndTokens(userId, session)`: Calls `sessionRepository.removeAll`, then `verificationTokenRepository.removeAll`. Both deletes use the passed Mongoose `ClientSession`, so they run inside the erasure's transaction.

## Relationships
- `src/modules/account/repository.ts`: provides `sessionRepository` (`listLive`, `removeAll`) and `verificationTokenRepository` (`removeAll`).
- `src/modules/account/presenter.ts`: `presentExportSession` shapes each row for the export.
- `src/modules/account/session/listing.ts`: `newestPerFamily` collapses session rows to the newest per family.
- `src/modules/account/session/strategy.ts`: `activeStrategy` and the `SessionRequest` type. The strategy does the mode-specific listing and credential extraction.
- `src/types/index.ts`: supplies the `Session` and `ExportSession` types.
- `src/modules/account/services/index.ts` and `src/modules/account/module.ts` are neighbors in the graph. This file's content doesn't show how they use it.
- `src/modules/account/tests/integration/auth-storage.test.ts` is a related integration test.

## Notes
- `sessionGet` and `sessionsList` read only the authenticated caller's own sessions, since the `userId` is the caller's own id.
- `exportSessions` calls `listLive` with `undefined` as its second argument and `new Date()` as its third. It does not use the active strategy, so it isn't filtered by mode through `activeStrategy`.
