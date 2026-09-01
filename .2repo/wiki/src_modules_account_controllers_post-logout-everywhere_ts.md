# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Thin HTTP adapter for `POST /account/logout-all`. It delegates the actual token invalidation to `accountService.tokenRemoveAll`, then clears the session cookies on the response. No business logic lives here.

## Key elements

- **`postLogoutEverywhere(request, response)`** — the sole export. Resolves the caller's auth ID via `authContextOf`, calls `accountService.tokenRemoveAll(id, TokenType.REFRESH, callerContext)`, destroys both the refresh cookie and the logged-in cookie, and sends a `200` success response with the message `"Logged out from all devices"`. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — registers `postLogoutEverywhere` on the `POST /account/logout-all` route.
- **`src/modules/account/services/index.ts`** — provides `accountService`, whose `tokenRemoveAll` method performs the DB-side removal of all refresh tokens for the user.
- **`src/modules/account/session/cookies.ts`** — provides `destroyRefreshCookie` and `destroyLoggedCookie`, which clear the respective cookie on the outgoing response.
- **`src/modules/users/index.ts`** (re-exporting from **`src/modules/users/model.ts`**) — provides the `TokenType.REFRESH` enum value used to scope which tokens are removed.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared async-error-to-HTTP-response helper.
- **`src/infrastructure/http/request.ts`** — provides `authContextOf` (extracts the authenticated user ID) and `callerContextOf` (extracts the caller's IP/UA context for audit).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the final JSON reply.

## Notes

- The controller does **not** send any body in the success response (`undefined` is passed as the payload).
- `TokenType.REFRESH` is hardcoded here; the "logout every device" semantics depend on the service treating this as "remove *all* tokens of that type for the user."
- The JSDoc comment above the export says "Remove jwt cookie," but the actual code only destroys the refresh and logged-in cookies via the cookie helpers — the JWT itself lives in the logged cookie.
