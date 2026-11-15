---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 282ba340dca018e45417e118755a51ee48e1ab220d669c0812cb316799ece6f4
generated_at: 2026-11-14T18:34:00.104347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

HTTP controller for `POST /account/password/reset/confirm`. It validates the request body, delegates the token spend + password set to the account service, and on success clears the session cookie and returns 204. It also emits a Prometheus counter for every attempt (success or failure).

## Key elements

- **`postResetConfirm`** (export) — The only export. Accepts an Express `Request` (typed with a `token` route param and `PasswordResetConfirmRequest` body) and `Response`. Flow:
  1. Parses/validates the body against `ConfirmPasswordResetBody` (Zod schema from `@api/schemas.zod`) via `parseBody`.
  2. Calls `accountService.completePasswordReset(token, password, passwordConfirm, callerContext, termsAccepted)`.
  3. On a `refused` result → increments the failure metric, returns early.
  4. On success → increments the success metric, calls `destroySessionCookie`, sends 204 via `noContentResponse`.
  5. On thrown error → increments the failure metric, forwards to `catchAs(response, 'postResetConfirm')`.

## Relationships

- **`src/modules/account/services/index.ts`** — This file imports `accountService` from this module and delegates all business logic (token validation, password hashing, one-time-token spend) to it. The controller performs no domain logic itself.
- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers that structure the request-validation / error-handling flow.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` sends the 204 on success.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie` clears the auth cookie so the old session is invalidated after the password change.
- **`src/modules/account/metrics.ts`** — `authPasswordResetConfirmTotal` is a labelled counter (`status: 'success' | 'failure'`) incremented on every path through the controller.
- **`src/modules/account/routes.ts`** — Registers this handler on the `POST /account/password/reset/confirm` route.
- **`src/types/index.ts`** — Provides the `PasswordResetConfirmRequest` type used in the Express request generic.

## Notes

- The reset **token is a URL path parameter**, not part of the body. The body carries `password`, `passwordConfirm`, and `termsAccepted`.
- The comment explicitly states that the ordering guarantee ("checks first, atomic spend second") is enforced **inside the service**, not here. A rejected password will never burn the one-time token.
- `authPasswordResetConfirmTotal` is incremented in *all three* exit paths (success, `refused`, catch), meaning every request produces exactly one metric increment.
- `src/infrastructure/adapters/logger.ts` appears in the dependency graph but is **not imported** by this file; it is likely used downstream by `catchAs` or the service.
