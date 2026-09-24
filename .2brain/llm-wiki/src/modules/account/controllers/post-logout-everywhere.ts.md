---
source: src/modules/account/controllers/post-logout-everywhere.ts
sha256: 9f6387a647ba564393c8c15ce7daf29f309f2ddfe657ae31bbed6680d6e8dedc
generated_at: 2026-09-23T18:02:41.732480+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Thin HTTP adapter for the `POST /account/logout-all` endpoint. It delegates the actual token-removal logic to `accountService.tokenRemoveAll`, then clears the session cookies on the response and returns a 200.

## Key elements

- **`postLogoutEverywhere(request, response)`** — The sole export. Calls `accountService.tokenRemoveAll(authId, TokenType.REFRESH, callerContext)` to delete all refresh tokens for the user, then destroys both the refresh cookie and the logged-in cookie via `destroyRefreshCookie` / `destroyLoggedCookie`, and finally sends `successResponse(…, 200, 'Logged out from all devices')`. Errors are funnelled through `catchAs(response, 'postLogoutEverywhere')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, the shared error-capture helper used in the `.catch` branch.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)` to extract caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the final 200 reply.
- **`src/modules/account/services/index.ts`** — provides `accountService.tokenRemoveAll`, the business-logic method this controller wraps.
- **`src/modules/account/session/cookies.ts`** — provides `destroyRefreshCookie` and `destroyLoggedCookie` used to clear cookies on the response.
- **`src/modules/users/index.ts`** → **`src/modules/users/model.ts`** — provides the `TokenType` enum; this file imports `TokenType.REFRESH` to scope the removal to refresh tokens only.
- **`src/modules/account/routes.ts`** — registers this handler as the route handler for `POST /account/logout-all`.

## Notes

- `request.authContext!.id` uses a non-null assertion — the endpoint is expected to sit behind an auth middleware that populates `authContext`; there is no explicit guard in this file.
- Uses promise `.then/.catch` rather than `async/await`, consistent with the project's controller style.
- Only refresh tokens are removed (`TokenType.REFRESH`); any other token types issued by the same user are left untouched.
