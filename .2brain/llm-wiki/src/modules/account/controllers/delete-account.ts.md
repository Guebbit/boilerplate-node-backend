---
source: src/modules/account/controllers/delete-account.ts
sha256: 4a800eb98582caa866be616556a8a53fcefc7b0c8b1b63de730b6ecf6c801846
generated_at: 2026-10-29T02:25:57.584431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account.ts

## Purpose

Handler for `DELETE /account`. An authenticated user requests deletion of their own account; the controller verifies the user still exists, delegates scheduling to the account service, clears the session cookie in the same response, and returns **202** with the `requestedAt` and `purgeAt` timestamps.

## Key elements

- **`deleteAccount(request, response)`** — single exported handler. Reads `request.authContext.id`, looks up the user via `userService.findAuthenticatableById`, calls `accountService.scheduleAccountDeletion`, destroys the session cookie, and writes the 202 body. Errors are funnelled through `catchAs(response, 'deleteAccount')`.
- **Metric increment** — on the "user row missing/locked" branch, `authAccountDeleteTotal.inc({ status: 'failure' })` is called before the 401 reply.

## Relationships

- **`@infrastructure/http/controller`** — imports `catchAs` for uniform error capture.
- **`@infrastructure/http/request`** — imports `callerContextOf` to derive the caller context passed into `scheduleAccountDeletion`.
- **`@infrastructure/http/response`** — imports `successResponse` (202 path) and `rejectResponse` (401 path).
- **`@modules/users`** (re-exported from `src/modules/users/index.ts` → `src/modules/users/services/index.ts`) — `userService.findAuthenticatableById` is the existence check before scheduling.
- **`../services`** (`src/modules/account/services/index.ts`) — `accountService.scheduleAccountDeletion` performs the actual lock-and-schedule write.
- **`../session/cookies`** — `destroySessionCookie` clears the session so the user is immediately logged out.
- **`../metrics`** — `authAccountDeleteTotal` counter for observability.
- **`src/modules/account/routes.ts`** — registers this handler on the `DELETE /account` route (with `isAuth` / 2FA middleware upstream).

## Notes

- The 401 when the user row is gone is **intentional**: a valid token pointing at a missing/locked row is a dead session, not a server fault (avoids a misleading 500).
- Only the `failure` metric label is incremented here; any `success` label is presumably recorded inside `accountService.scheduleAccountDeletion`.
- `request.authContext!` uses a non-null assertion — the `isAuth` middleware (applied in `routes.ts`) is the sole gate that guarantees it is present; do not call this handler without that middleware.
- The session cookie is destroyed **before** `successResponse` writes the body, so the 202 response is the last request the client can make with that token.
