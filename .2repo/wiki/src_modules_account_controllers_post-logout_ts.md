# src/modules/account/controllers/post-logout.ts

## Purpose
Handler for `POST /account/logout`. Destroys the **current** session only (identified by its refresh cookie) while leaving sessions on other devices untouched. Treats "not logged in" as success rather than an error, so it always returns 200.

## Key elements
- **`postLogout(request, response)`** — The sole export. Reads the `jwt` refresh cookie from `request.cookies`, calls `accountService.logoutCurrentSession`, then clears both the refresh and logged-in cookies and sends a 200 with an i18n-translated success message. Errors are funneled through `catchAs`.

## Relationships
- **`src/modules/account/routes.ts`** — Registers `postLogout` as the handler for `POST /account/logout`.
- **`src/modules/account/services/index.ts`** — Supplies `accountService.logoutCurrentSession(token, callerContext)` which performs the token revocation.
- **`src/modules/account/session/cookies.ts`** — Provides `destroyRefreshCookie` and `destroyLoggedCookie` to clear the two session cookies on the response.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-to-response mapper.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive IP/user-agent context for audit logging.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the standard 200 envelope.
- **`src/infrastructure/i18n/`** — Provides `t()` to translate the success message key `account.logout.success`.

## Notes
- The refresh cookie key is `jwt` (read from `request.cookies.jwt`), not a bearer token. The cookie *is* the session credential, so no `Authorization` header is needed.
- A missing cookie or an already-revoked token does **not** produce an error response; the function still returns 200. This is intentional — the caller asked to be logged out, and they already are.
- Only the current session is revoked. Other active sessions on other devices are unaffected. Use a separate "logout all" endpoint for that.
