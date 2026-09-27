---
source: src/modules/account/controllers/get-sessions.ts
sha256: 7028593b8db871cdab9316ca7b72bfe28bad65fb84e3a633e8d45f4951756bfb
generated_at: 2026-09-27T14:23:35.735771+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-sessions.ts

## Purpose

Thin HTTP adapter for `GET /account/sessions`. Reads the caller's refresh cookie, delegates to `accountService.sessionsList`, and shapes the result into a JSON response. All token-classification and redaction logic lives in the service layer.

## Key elements

- **`getSessions(request, response)`** – The sole export. Reads `request.authContext!.id` (set by upstream `isAuth` middleware) and the refresh cookie, calls `accountService.sessionsList(id, cookieToken)`, and either returns a `403` (via `refused`) or a `200` with a `SessionsResponse` body (via `successResponse`).

## Relationships

- **`src/infrastructure/http/response.ts`** – Imports `successResponse` to emit the standard 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** – Imports `refused` (short-circuits with 403 when the service signals rejection) and `catchAs` (maps unhandled rejections to a structured error response tagged `'getSessions'`).
- **`src/kernel/cookies.ts`** – Imports `readRefreshCookie` to extract the current refresh token from the incoming request.
- **`src/modules/account/services/index.ts`** – Imports `accountService` and calls its `sessionsList` method; the service owns the business logic.
- **`src/modules/account/routes.ts`** – Registers `getSessions` on the `GET /account/sessions` route (implied by the file's stated purpose).
- **`src/types/index.ts`** – Imports the `SessionsResponse` type used as the generic parameter of `successResponse`.

## Notes

- `request.authContext!` uses a non-null assertion; correctness depends entirely on the `isAuth` middleware running first. There is no defensive check here.
- The refresh cookie is read **in the controller** and passed as a plain string into the service. The service uses it only to mark which session is `current`; it does not authenticate with it.
- Which token types count as a "session" and how token values are kept off the wire are explicitly delegated to `services/tokens.ts` (referenced in the docblock, not imported here).
