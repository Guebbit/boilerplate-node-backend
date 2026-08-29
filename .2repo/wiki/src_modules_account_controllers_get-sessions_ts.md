# src/modules/account/controllers/get-sessions.ts

## Purpose

Request handler for `GET /account/sessions`. It extracts the authenticated user's ID and the current `jwt` cookie, delegates to the account service to list live refresh tokens as sessions, and shapes the HTTP response. It exists as the thin controller layer that translates HTTP I/O into a service call.

## Key elements

- **`getSessions(request, response)`** – Sole export. Reads the user `id` from the auth context and the `jwt` cookie, calls `accountService.sessionsList(id, cookieToken)`, then responds with `successResponse` on success or short-circuits via `refused`. Errors are funneled through `catchAs(response, 'getSessions')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies the `refused` guard (checks for a refused/error result and sends the appropriate status) and `catchAs` (unified error-to-response mapping).
- **`src/infrastructure/http/request.ts`** – Supplies `authContextOf`, which extracts the authenticated user's `id` from the request (set upstream by `isAuth` middleware).
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, the standard 200 JSON envelope wrapper.
- **`src/modules/account/routes.ts`** – Registers `getSessions` on the `GET /account/sessions` route.
- **`src/modules/account/services/index.ts`** – Exposes `accountService.sessionsList`, which performs the actual token-to-session mapping and enforces the "token value never reaches the wire" rule.

## Notes

- Authentication is **not** verified in this file; it relies on `isAuth` middleware running earlier in the route chain.
- The `jwt` cookie is read here specifically because it identifies *which* session the current request belongs to (a request-level fact). The service layer receives it as an opaque string and decides what to surface.
- The cookie key is literally `"jwt"` (not `"refresh"` or similar). The cast to `Record<string, string | undefined>` is the only runtime access to `request.cookies` in this file.
- The doc comment notes that the rule "token value never reaches the wire" lives in `services/tokens.ts`, not here — this controller just passes the raw cookie value downstream.
