---
source: src/modules/account/controllers/get-account-export.ts
sha256: e3d0345252a82b4aef342a20c1914a2060668740e7bba153e169bf24995abb88
generated_at: 2026-11-08T04:01:19.005147+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account-export.ts

## Purpose

Two Express route handlers for the account-export feature: one returns the caller's export **status** (state, dates) and the other **streams** the finished export file as a JSON attachment. The split exists because the file endpoint requires fresh auth (`requireFreshAuth`) and streams raw bytes, while the status endpoint is a lightweight, envelope-wrapped query.

## Key elements

- **`getAccountExportStatus`** (`GET /account/export`) — Calls `readOwnExport(userId)`. Returns the export status via `successResponse`, or a `404` with an i18n message if none exists. Error path goes through `catchAs`.
- **`getAccountExport`** (`GET /account/export/file`) — Calls `openOwnExport(userId, callerContextOf(request))`. On success, sets `Content-Disposition: attachment` (filename `account-export-{requestedDay}.json`), `Content-Type: application/json`, and `Cache-Control: private, no-store`, then streams via `pipeline(opened.stream, response)`. On failure, either destroys the connection (headers already sent) or falls back to `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — Mounts both handlers; applies `isAuth` to the status route and `isAuth` + `requireFreshAuth` to the file route.
- **`src/modules/account/services/export.ts`** — Source of `readOwnExport` (status lookup) and `openOwnExport` (validates ownership and returns the readable stream).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-to-response helper.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` for envelope-wrapped replies.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to pass request context into `openOwnExport`.
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for the `account.export.not-found` message.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger.warn` for the aborted-download case (headers already sent).

## Notes

- **No response envelope on the file endpoint.** The body *is* the `AccountExportResponse` document; wrapping it would corrupt a saved file. All other responses in this codebase use `successResponse`/`rejectResponse`.
- **One live export per account.** There is no export ID in the URL; ownership is enforced by the service query, not a path parameter.
- **Streaming via `pipeline` (node:stream/promises).** Backpressure-aware; rejects if either side closes early (e.g. client disconnects mid-download). The catch handler must check `response.headersSent` before attempting to send a JSON error body.
- **`Cache-Control: private, no-store`** is set explicitly — the payload is a person's full data export and must never be cached by proxies or browsers.
- **Filename is server-chosen.** `content-disposition` (via `response.attachment`) sets the `filename` per RFC 6266; the client cannot influence it.
