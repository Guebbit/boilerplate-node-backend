# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Express controller handler for `POST /account/logout-all`. It performs a full multi-device logout: removes every refresh token for the authenticated user from the database, then clears the session and refresh cookies on the response.

## Key elements

- **`postLogoutEverywhere`** (default export) — The sole exported handler. Calls `accountService.tokenRemoveAll` with the user ID, `TokenType.REFRESH`, and the caller context; on success destroys both cookies and replies `200 "Logged out from all devices"` with no body. Errors are delegated to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — `catchAs` wraps the `.catch` to produce a standard error response.
- **`@infrastructure/http/request`** — `authContextOf(request).id` supplies the user identifier; `callerContextOf(request)` is forwarded to the service for audit/tracing.
- **`@infrastructure/http/response`** — `successResponse` shapes the 200 reply.
- **`../services` (account services)** — `accountService.tokenRemoveAll` is the actual DB mutation that purges all refresh tokens.
- **`../session/cookies`** — `destroyLoggedCookie` and `destroyRefreshCookie` clear the respective cookie values on the outgoing response.
- **`@modules/users`** — Provides the `TokenType.REFRESH` enum used as the token filter.
- **`routes.ts`** (account module) — Registers this handler on the `POST /account/logout-all` route.

## Notes

- The handler uses a promise chain (`.then`/`.catch`) rather than `async/await`, consistent with the rest of the controller layer.
- The success response carries no payload (`undefined` body); the only signal to the client is the 200 status and the `message` string.
- Because it removes *all* refresh tokens of type `REFRESH`, a concurrent session on another device will be invalidated on its next token refresh — there is no per-device opt-out.
