# src/modules/account/controllers/post-logout.ts

## Purpose

HTTP controller for `POST /account/logout`. It acts as a thin adapter that reads the refresh token from the request cookie, delegates to `accountService.logoutCurrentSession`, clears the session cookies, and returns a localized success message. It exists to keep the route layer free of business logic while providing a single, predictable logout endpoint.

## Key elements

- **`postLogout(request, response)`** — The sole export. Reads `request.cookies.jwt` as the refresh token, calls `accountService.logoutCurrentSession` with that token and `callerContextOf(request)`, then on success destroys both the refresh and "logged" cookies and replies `200` with `t('account.logout.success')`. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `postLogout` as the handler for the `POST /account/logout` route.
- **`src/modules/account/services/index.ts`** — Source of `accountService.logoutCurrentSession`, the actual revocation logic.
- **`src/modules/account/session/cookies.ts`** — Supplies `destroyRefreshCookie` and `destroyLoggedCookie`, the two cookie-clearing helpers invoked after a successful logout.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracting caller metadata (IP, user-agent, etc.) for audit/logging.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the uniform 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-catch wrapper that maps thrown errors to HTTP responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Source of the `t()` translation function used for the success message.

## Notes

- **Always 200.** A missing or already-revoked refresh cookie is treated as "not logged in on this device," not as an error. Clients should not expect 4xx here.
- **Session-scoped, not account-scoped.** Only the current session is revoked; other devices remain signed in (contrast with a "logout all" endpoint if one exists elsewhere).
- **No bearer token required.** The refresh cookie doubles as both the credential and the address of the session to revoke, mirroring the pattern used by `GET /account/refresh`.
- The token is read from `request.cookies.jwt` — not from `Authorization` headers — so any middleware that populates `req.cookies` must run before this handler.
