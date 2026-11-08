---
source: src/modules/account/controllers/get-sessions.ts
sha256: 6bec8749074b9fff91aa7e7a83a72ea3d5e575b09865c3cbe855e8b44b95eedd
generated_at: 2026-11-08T04:02:53.249541+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-sessions.ts

## Purpose

Thin Express controller that handles `GET /account/sessions`. It extracts the authenticated user's ID from the request context, delegates to `accountService.sessionsList`, and writes the result through the shared response helpers. All session semantics (which rows qualify, how `current` is flagged, credential hygiene) live in the service layer, not here.

## Key elements

- **`getSessions(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `accountService.sessionsList(id, request)`, and either sends a `successResponse<SessionsResponse>` with `{ sessions }` or routes the error to `catchAs(response, 'listSessions')`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to format the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for uniform error handling (tags the failure as `'listSessions'`).
- **`src/modules/account/services/index.ts`** — Imports `accountService`; the only business-logic call in this file is `accountService.sessionsList`.
- **`src/types/index.ts`** — Imports `SessionsResponse` as the response payload type.
- **`src/modules/account/routes.ts`** — Consumes `getSessions` as the route handler for `GET /account/sessions` (implied by the module docstring and naming convention).

## Notes

- `request.authContext!` uses a non-null assertion on the premise that an `isAuth` middleware has already run; the controller has no defensive check.
- The full `request` object is forwarded to the service (not just the `id`), so the service can inspect headers, IP, etc. to mark the `current` session.
- Error handling is delegated entirely to `catchAs`; there is no local `try/catch` or status-code branching in this file.
