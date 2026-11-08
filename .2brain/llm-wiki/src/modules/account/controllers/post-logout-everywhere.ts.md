---
source: src/modules/account/controllers/post-logout-everywhere.ts
sha256: 7a863d9dbbbe3d7e10ef6d580284a4fb8f5dbe013d3cc337f7bd69b55b91ee4f
generated_at: 2026-11-08T04:05:58.987026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Thin HTTP adapter for the `DELETE /account/sessions` endpoint. It delegates all business logic to `accountService.logoutEverywhere` and is responsible only for translating the service result into an HTTP response: destroying the session cookie, returning `204` on success, or a rejection with error details on failure.

## Key elements

- **`postLogoutEverywhere`** (exported const) — The controller handler. Reads the user ID from `request.authContext` and caller info from `callerContextOf(request)`, calls `accountService.logoutEverywhere`, then either destroys the session cookie and sends `204 No Content`, or sends a rejection response if the service reports a failed revocation. Errors from the promise are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `noContentResponse` (success path) and `rejectResponse` (failed-revocation path).
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for promise-rejection handling attached to the returned promise.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to extract caller metadata (e.g. IP/UA) passed into the service call.
- **`src/modules/account/services/index.ts`** — Imports `accountService` and calls its `logoutEverywhere` method (the actual revocation + epoch-bump logic).
- **`src/modules/account/session/cookies.ts`** — Imports `destroySessionCookie` to clear the refresh-token cookie after a successful call.
- **`src/modules/account/routes.ts`** — Registers this handler on the `DELETE /account/sessions` route (implied by the doc comment and module structure).

## Notes

- **Naming vs. verb:** The function is named `postLogoutEverywhere` and the file is `post-logout-everywhere.ts`, but the HTTP method it serves is **DELETE**, not POST. The "post" prefix appears to mean "perform" rather than the HTTP verb.
- **Non-null assertion:** `request.authContext!` assumes an auth guard has already populated the context; calling this handler without that guard will throw at runtime.
- **Security intent (in-code comment):** A failed revocation is deliberately surfaced as an error rather than `204`, so the caller cannot assume all devices are signed out when a stale token may still be valid.
- **No re-mint:** The caller's own session is also destroyed; the controller does not issue a new token or cookie.
