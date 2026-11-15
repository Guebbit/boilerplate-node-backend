---
source: src/modules/account/controllers/delete-account.ts
sha256: bc40ca886ff2a481b621baa7d972e2de025ab8deffff58e01f9ba0978e08515b
generated_at: 2026-11-14T18:30:38.990062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account.ts

## Purpose

Single-purpose Express controller for `DELETE /account`. When an authenticated user requests deletion, it verifies the account row still exists, schedules a timed purge via the account service, destroys the session cookie, and responds 202 with `requestedAt` and `purgeAt` timestamps.

## Key elements

- **`deleteAccount(request, response)`** — the sole export. Reads `request.authContext.id` (populated by upstream `isAuth` middleware), looks up the user through `accountUserService.findAuthenticatableById`, then delegates to `accountService.scheduleAccountDeletion(user, callerContextOf(request))`. On success destroys the session cookie and sends 202. On missing/locked user returns 401. Errors are funneled to `catchAs`.

## Relationships

- **`src/modules/users/friends/account.ts`** — source of `accountUserService`, used to confirm the authenticated user's row is still present and authenticatable before scheduling deletion.
- **`src/modules/account/services/index.ts`** — source of the `accountService` import; the controller calls `scheduleAccountDeletion(user, callerContextOf(request))` on it to perform the lock + purge-scheduling write.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie(response)` clears the session because all sessions are invalidated by the same write that locks the account.
- **`src/modules/account/metrics.ts`** — increments `authAccountDeleteTotal` (label `status: 'failure'`) when the user row is missing.
- **`src/modules/account/routes.ts`** — mounts `deleteAccount` on the `DELETE /account` path (the only consumer of this export).
- **`src/infrastructure/http/controller.ts`** — `catchAs(response, 'deleteAccount')` is the error-handling wrapper for the promise chain.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller identity/context passed into `scheduleAccountDeletion`.
- **`src/infrastructure/http/response.ts`** — `successResponse` (202 payload) and `rejectResponse` (401 on missing user).

## Notes

- **401, not 404**, is returned when the user row is absent or locked. The inline comment makes the intent explicit: a valid bearer token pointing at a gone/locked row is a *dead session*, not a server error.
- **Cookie destruction is deliberate and immediate** — the session is considered already dead by the time `scheduleAccountDeletion` resolves, so the cookie is removed in the same response rather than relying on a later server-side expiry.
- **Auth is assumed, not checked here.** The docblock notes `isAuth` (plus 2FA / OTP if applicable) runs as upstream middleware; this controller trusts `request.authContext` to be non-null (note the `!`).
- The promise chain is **`.then().then().catch()`** rather than async/await — consistent with the project's `catchAs` error-handling convention from `src/infrastructure/http/controller.ts`.
