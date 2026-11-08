---
source: src/modules/account/controllers/post-logout.ts
sha256: ff86663235e97fdc8c64f75001b737c8087a09b9d5d0399a5ccfc6fbb553ac1b
generated_at: 2026-11-08T04:06:07.432353+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter that handles `POST /account/logout`. It extracts the session credential from the refresh cookie, delegates to `accountService.logoutCurrentSession` to revoke the stored token, then clears the cookie and returns a 204. It exists to keep route wiring (in `routes.ts`) decoupled from the actual logout logic in the service layer.

## Key elements

- **`postLogout(request: Request, response: Response)`** — The sole export. Reads the session credential from the request, calls `accountService.logoutCurrentSession(credential, callerContext)`, then on success calls `destroySessionCookie(response)` and `noContentResponse(response)`. Errors are funneled through `catchAs(response, 'postLogout')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService.logoutCurrentSession`, the actual revocation logic this controller delegates to.
- **`src/modules/account/session/session.ts`** — `sessionCredentialOf(request)` extracts the refresh-cookie credential from the request.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie(response)` clears the session cookie on the outgoing response.
- **`src/infrastructure/http/response.ts`** — `noContentResponse(response)` sends the 204 status.
- **`src/infrastructure/http/controller.ts`** — `catchAs(response, 'postLogout')` handles error formatting for this specific endpoint.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts caller metadata passed into the service call.
- **`src/modules/account/routes.ts`** — Registers `postLogout` as the handler for the `POST /account/logout` route.

## Notes

- The refresh cookie serves as **both** credential and addressing mechanism (no bearer token needed), mirroring the pattern in `POST /account/refresh`.
- The endpoint is idempotent by design: a missing or already-revoked cookie is treated as "not logged in here" and still yields a 204, never a 4xx/5xx.
- Logout is **per-session** only; refresh tokens on other devices are unaffected.
