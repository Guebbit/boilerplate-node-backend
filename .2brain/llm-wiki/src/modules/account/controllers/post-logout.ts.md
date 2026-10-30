---
source: src/modules/account/controllers/post-logout.ts
sha256: ff86663235e97fdc8c64f75001b737c8087a09b9d5d0399a5ccfc6fbb553ac1b
generated_at: 2026-10-29T02:30:54.082020+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

HTTP adapter for `POST /account/logout`. Translates an Express request/response into a single call to `accountService.logoutCurrentSession`, then clears the session cookie and returns 200 No Content. It exists to keep the logout logic in the service layer while this file handles only the HTTP surface (credential extraction, cookie teardown, error mapping).

## Key elements

- **`postLogout(request, response)`** (exported) — The sole handler. Reads the session credential from the request, delegates to `accountService.logoutCurrentSession`, then destroys the session cookie and sends a 200. Errors are funneled through `catchAs(response, 'postLogout')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService`; calls `logoutCurrentSession(credential, callerContext)`, which performs the actual token revocation.
- **`src/modules/account/session/cookies.ts`** — Calls `destroySessionCookie(response)` to clear the client-side cookie after a successful logout.
- **`src/modules/account/session/session.ts`** — Calls `sessionCredentialOf(request)` to extract the stored refresh-token credential used as the logout target.
- **`src/infrastructure/http/response.ts`** — Imports `noContentResponse` to emit the 200 body.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to build the caller context passed to the service.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for uniform error-to-HTTP mapping.
- **`src/modules/account/routes.ts`** — Registers `postLogout` as the handler for the `POST /account/logout` route.

## Notes

- **Always 200.** A missing or already-revoked cookie is treated as "not logged in here" and still results in a 200; there is no 401/404 path in the happy-or-error branches.
- **Cookie-as-credential pattern.** The refresh cookie itself identifies *which* session to revoke (analogous to `POST /account/refresh`), so no bearer token is expected. Only the current device is logged out; other devices remain signed in.
- **Thin by design.** No business logic lives here — validation, revocation, and auditing are all in the service.
