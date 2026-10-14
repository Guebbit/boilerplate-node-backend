---
source: src/modules/account/controllers/get-sessions.ts
sha256: 6bec8749074b9fff91aa7e7a83a72ea3d5e575b09865c3cbe855e8b44b95eedd
generated_at: 2026-10-14T08:32:39.788842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-sessions.ts

## Purpose

Thin HTTP adapter for `GET /account/sessions`. It extracts the authenticated user's ID, delegates to `accountService.sessionsList`, and writes the result back as a JSON response. All session-querying logic (which rows qualify, marking the current session, keeping credentials off the wire) lives in the service layer.

## Key elements

- **`getSessions`** (exported) — Express handler. Reads `request.authContext.id`, calls `accountService.sessionsList(id, request)`, responds via `successResponse<SessionsResponse>` on success or `catchAs(response, 'listSessions')` on failure.
- **`successResponse`** (imported) — Serialises the payload into a consistent success envelope.
- **`catchAs`** (imported) — Normalises thrown errors into an error-shaped response; the second argument (`'listSessions'`) is used as the operation label in the error body.
- **`accountService.sessionsList`** (imported from `../services`) — The actual data-fetching method; accepts a user ID and the raw request so it can identify the caller's session.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `catchAs`, the shared error-to-response helper used here.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, the shared success-envelope writer.
- **`src/modules/account/routes.ts`** — Wires `getSessions` to the `GET /account/sessions` route (upstream consumer).
- **`src/modules/account/services/index.ts`** — Provides the `accountService` singleton whose `sessionsList` method performs the real work.
- **`src/types/index.ts`** — Defines the `SessionsResponse` type that shapes the response payload.

## Notes

- `request.authContext!` uses a non-null assertion; the `isAuth` middleware is expected to have already rejected unauthenticated requests, so the assertion is safe by contract, not by runtime guard.
- The controller passes the full `request` object to the service, not just the ID — the service uses it to flag the caller's own session as `current`.
- Error handling is entirely delegated to `catchAs`; there is no try/catch or per-error branching in this file.
