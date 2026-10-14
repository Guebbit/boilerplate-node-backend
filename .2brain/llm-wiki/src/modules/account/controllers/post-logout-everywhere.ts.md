---
source: src/modules/account/controllers/post-logout-everywhere.ts
sha256: c3b3ae456a608f6d952c2f795835fe4f7bcaea7ab2f8fd2a2a8818139971d127
generated_at: 2026-10-14T14:36:40.125184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

HTTP adapter for `POST /account/logout-all`. It revokes every refresh token in the database, advances the session epoch (invalidating already-issued access tokens), and destroys the caller's own cookies — a full sign-out from all devices with no re-mint.

## Key elements

- **`postLogoutEverywhere(request, response)`** — The sole export. Calls `accountService.logoutEverywhere(userId, callerContext)`. On success, destroys the session and logged cookies and returns a `200` with an i18n-ized message. On a failed revocation result, returns the error status and messages via `rejectResponse` instead of a success. Unhandled exceptions are delegated to `catchAs`.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService.logoutEverywhere`, the actual business logic (token revocation, epoch bump).
- **`src/modules/account/session/cookies.ts`** — Supplies `destroySessionCookie` and `destroyLoggedCookie`, which clear the cookies on the response.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for shaped JSON replies.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract IP/user-agent for the service call.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the standard async error-catcher wrapper.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — Supplies the `t()` function used for the localized success message.
- **`src/modules/account/routes.ts`** — The route table that wires this handler to the `POST /account/logout-all` path.

## Notes

- `request.authContext!.id` uses a non-null assertion; the route is expected to be behind an auth middleware that populates `authContext`.
- The code deliberately treats a *failed* revocation as an error response rather than a success, so a client never believes all devices are logged out while a stolen refresh token remains valid.
- No new access token or cookie is issued — the caller is signed out and must re-authenticate.
