---
source: src/modules/account/controllers/get-sessions.ts
sha256: aaf3da86eab189faed79c941b78633132354f36d8eca62170dcdc3ec46652ced
generated_at: 2026-09-23T18:01:02.072114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-sessions.ts

## Purpose

Thin HTTP adapter for the `GET /account/sessions` endpoint. It extracts the authenticated user ID and the current refresh-token cookie from the request, delegates to `accountService.sessionsList`, and shapes the result into a standard JSON response. All business logic (which token types count as a session, marking the current token, suppressing token values) lives in the service layer.

## Key elements

- **`getSessions`** (exported function) — Express request handler. Reads `request.authContext.id` and the `jwt` cookie, calls `accountService.sessionsList(id, cookieToken)`, then either sends a `successResponse<SessionsResponse>` or short-circuits via `refused`. Errors are funneled through `catchAs(response, 'getSessions')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (unified error-to-HTTP mapping) and `refused` (early-return guard for rejected results).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the standard 200 JSON envelope.
- **`src/modules/account/services/index.ts`** — provides `accountService`, whose `sessionsList` method contains the actual session-query logic.
- **`src/modules/account/routes.ts`** — registers `getSessions` as the handler for the `GET /account/sessions` route (behind the `isAuth` middleware).
- **`src/types/index.ts`** — exports the `SessionsResponse` shape used to type the success payload.

## Notes

- Auth is assumed, not checked here; the `isAuth` middleware upstream guarantees `request.authContext` is populated. The non-null assertion (`!`) is safe by contract, not by runtime guard.
- The cookie name is hardcoded as `'jwt'` in this file. If the cookie name changes, it must be updated here **and** wherever the cookie is set.
- `catchAs` receives the string `'getSessions'` purely as a log/context label; it does not affect routing or status codes.
