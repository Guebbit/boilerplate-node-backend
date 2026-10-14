---
source: src/modules/account/controllers/get-account-export.ts
sha256: b2d5901e5e84faeb4b527faea11fbd278dea79bbfbd6a9297d7aaa84133d07df
generated_at: 2026-10-14T08:30:12.191499+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account-export.ts

## Purpose

HTTP controller for `GET /account/export/:id`. Streams the caller's own finished export back as a JSON file attachment. Exists so the page opened from a mailed link can deliver the export file directly to the owner without ever buffering the document in memory.

## Key elements

- **`getAccountExport`** (default and only export) — Express handler. Validates the `:id` param via `requireId`, pulls `userId` from `request.authContext`, calls `openOwnExport`, then pipes the resulting stream into the Express `Response`.
- **Response headers** — Sets `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="account-export.json"`, and `Cache-Control: private, no-store` before streaming begins.
- **Error path** — If `response.headersSent` is already true (stream started, client hung up), logs a warning and calls `response.destroy()`. Otherwise delegates to `catchAs(response, 'getAccountExport')`.

## Relationships

- **`src/modules/account/routes.ts`** — Mounts this handler on the `/account/export/:id` route, wrapped in `requireFreshAuth` which populates `request.authContext`.
- **`src/modules/account/services/export.ts`** — Provides `openOwnExport(userId, exportId, callerContext)`, which performs the ownership query and returns a readable stream (or `null` if not found / not owned).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the route param; returns `undefined` (and sends a 404) for malformed IDs before any service call.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller context object passed into the service.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` sends the standard error envelope for the 404 (no-stream) case.
- **`src/infrastructure/http/controller.ts`** — `catchAs` formats and sends the standard error envelope when headers have not yet been sent.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` resolves the `account.export.not-found` message.
- **`src/infrastructure/adapters/logger.ts`** — Emits a `warn` log when a download is aborted mid-stream.

## Notes

- The response body is **not** wrapped in the project's usual envelope; the raw document *is* the response. A saved file contains only the export data.
- Streaming uses `pipeline` from `node:stream/promises`, which applies backpressure and destroys both streams on error. This is intentional: the file may be arbitrarily large.
- The 404 for "not found / not owner" is indistinguishable to the caller from a genuinely missing export (same message, same status) — there is no "exists but not yours" branch.
- `request.authContext!` is asserted non-null because the `requireFreshAuth` middleware on the route guarantees it; the `!` is load-bearing, not decorative.
