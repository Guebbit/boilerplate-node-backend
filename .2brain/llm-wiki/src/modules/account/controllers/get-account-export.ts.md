---
source: src/modules/account/controllers/get-account-export.ts
source_sha256: 8537b222b290f50696341a54676c2145206526372b0cb69775c6b86d1f286fd8
context_sha256: b0b1810f9a5345d035d007d8291b2015aa37f7c6dece646274994c8efa7ba2e8
generated_at: 2026-11-22T03:21:05.983622+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-account-export.ts

## Purpose
Express controllers for the account data export: one reports the status of the caller's export, the other streams the finished export file to its owner as a JSON download. The file route is protected by `requireFreshAuth` (mounted elsewhere, on the route), which is the identity proof. The service's ownership query is the authorization.

## Key elements
- `getAccountExportStatus(request, response)` — `GET /account/export`. Reads `authContext.id`, calls `readOwnExport(userId)`, and returns the status through `successResponse`. Responds `404` if there is no export. It carries only dates and a state, so it needs no fresh session.
- `getAccountExport(request, response)` — `GET /account/export/file`. Calls `openOwnExport(userId, callerContextOf(request))`. On a hit it:
  - sets `Content-Disposition` via `response.attachment('account-export-<requestedDay>.json')`;
  - sets status `200`, `Content-Type: application/json; charset=utf-8` and `Cache-Control: private, no-store`;
  - streams the file with `pipeline(opened.stream, response)`.
  
  It responds `404` if there is no export.

## Relationships
- `src/modules/account/services/export.ts` — supplies `readOwnExport` and `openOwnExport`. The latter returns `{ stream, requestedDay }` or a falsy value.
- `src/infrastructure/http/response.ts` — `successResponse` and `rejectResponse` build the standard envelope and the `404` rejections.
- `src/infrastructure/http/controller.ts` — `catchAs(response, label)` handles errors, with labels `getAccountExport` and `downloadAccountExport`.
- `src/infrastructure/http/request.ts` — `callerContextOf(request)` supplies the caller context passed to `openOwnExport`.
- `src/infrastructure/i18n/index.ts` — `t(...)` supplies the localized `404` message.
- `src/infrastructure/adapters/logger.ts` — `logger` records a warning when a download is aborted.
- `src/modules/account/routes.ts` — mounts these handlers. The module doc says `requireFreshAuth` sits on the file route.
- `src/infrastructure/i18n/context.ts` is a graph neighbor, but this file has no visible interaction with it.

## Notes
- Both handlers rely on `request.authContext!` being set by the `isAuth` middleware.
- The download is streamed and never read into memory, because export files can be large. It is deliberately not wrapped in the response envelope. The body is the export document itself (`AccountExportResponse`), so a saved file contains only the export.
- Error handling after streaming starts: if `response.headersSent`, the handler logs a warning (`account export download aborted`) and calls `response.destroy()`, since no envelope can be sent. Otherwise it falls back to `catchAs`. `pipeline` rejects if the client hangs up mid-download.
- The status branch returns the promise from `rejectResponse` or `successResponse`. The download's `404` branch returns `undefined` after rejecting.
