---
source: src/modules/account/controllers/get-account-export.ts
sha256: e3d0345252a82b4aef342a20c1914a2060668740e7bba153e169bf24995abb88
generated_at: 2026-10-29T02:26:28.674214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account-export.ts

## Purpose

HTTP controllers for the account-export endpoints: one returns the status of the caller's export job, the other streams the finished export file as a JSON download. They exist to separate the "is my export ready?" poll from the actual file transfer, and to enforce that the file is always owned by the authenticated caller.

## Key elements

- **`getAccountExportStatus`** – `GET /account/export`. Calls `readOwnExport(userId)`; returns the status payload via `successResponse` or a `404` (i18n message) when no export exists. No fresh-auth requirement; the response carries only dates/state, no personal data.
- **`getAccountExport`** – `GET /account/export/file`. Calls `openOwnExport(userId, callerContextOf(request))` to obtain a readable stream, then pipes it to the Express response via `node:stream/promises` `pipeline`. Sets `Content-Disposition: attachment`, `Content-Type: application/json`, and `Cache-Control: private, no-store`. The body is the raw `AccountExportResponse` document (no envelope). Errors after headers are sent are handled by logging and destroying the socket; earlier errors go through `catchAs`.

## Relationships

- **`src/modules/account/services/export.ts`** – source of `readOwnExport` (status lookup) and `openOwnExport` (stream open); the service's ownership query is the authorization gate.
- **`src/modules/account/routes.ts`** – mounts these two handlers on their respective paths; the file route additionally carries `requireFreshAuth`.
- **`src/infrastructure/http/response.ts`** – provides `successResponse` / `rejectResponse` for the status endpoint's envelope.
- **`src/infrastructure/http/controller.ts`** – provides `catchAs`, the shared error-to-response helper.
- **`src/infrastructure/http/request.ts`** – provides `callerContextOf` to extract the caller identity for the export service.
- **`src/infrastructure/i18n/index.ts`** (re-exports `context.ts`) – provides `t()` for the `account.export.not-found` message.
- **`src/infrastructure/adapters/logger.ts`** – `logger.warn` for aborted in-flight downloads.

## Notes

- The file endpoint intentionally bypasses the `successResponse` envelope: the downloaded file must be *exactly* the export document, so no wrapper keys appear.
- An account has at most one live export, so neither handler takes an export ID parameter.
- `pipeline` (not `stream.pipe`) is used so that backpressure is honoured and both ends are destroyed on early close; the promise rejects if the client hangs up mid-download.
- Once headers have been flushed, the only possible error response is `response.destroy()` — there is no way to send a JSON error body.
- The download filename (`account-export-${requestedDay}.json`) is set server-side via Express's `attachment()` helper; the client cannot choose it.
