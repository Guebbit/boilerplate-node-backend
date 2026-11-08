---
source: src/modules/account/controllers/delete-account.ts
sha256: 4a800eb98582caa866be616556a8a53fcefc7b0c8b1b63de730b6ecf6c801846
generated_at: 2026-11-08T04:00:32.190077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account.ts

## Purpose

Controller for the `DELETE /account` endpoint. Given an authenticated user, it locks their account, schedules a future purge, returns a `202` with the `requestedAt` and `purgeAt` dates, and destroys the session cookie in the same response.

## Key elements

- **`deleteAccount`** – exported Express handler. Resolves the user via `userService.findAuthenticatableById`, delegates to `accountService.scheduleAccountDeletion`, then responds `202` with both ISO dates. On a missing/locked user row it responds `401` and increments a failure metric.

## Relationships

- **`src/modules/account/services/index.ts`** – calls `accountService.scheduleAccountDeletion(user, callerContext)`.
- **`src/modules/users/index.ts`** – calls `userService.findAuthenticatableById(id)` to verify the user still exists and is authenticatable.
- **`src/modules/account/session/cookies.ts`** – calls `destroySessionCookie(response)` so the caller's session is invalidated in the same round-trip.
- **`src/infrastructure/http/response.ts`** – uses `successResponse` (202) and `rejectResponse` (401) for HTTP replies.
- **`src/infrastructure/http/request.ts`** – calls `callerContextOf(request)` to pass IP/UA context into the service layer.
- **`src/infrastructure/http/controller.ts`** – wraps the promise chain in `catchAs(response, 'deleteAccount')` for uniform error handling.
- **`src/modules/account/metrics.ts`** – increments `authAccountDeleteTotal` with `status: 'failure'` on the 401 path.
- **`src/modules/account/routes.ts`** – registers this handler on the `DELETE /account` route.

## Notes

- `request.authContext!` uses a non-null assertion; it is safe only because the `isAuth` middleware (documented in the JSDoc) guarantees the token has been verified and attached before this handler runs.
- A `401` (not `404`) is returned when the user row is missing or locked — the intent is to signal "your session is dead" rather than leak whether the account exists.
- 2FA / OTP verification is expected to be enforced by upstream middleware, not here.
