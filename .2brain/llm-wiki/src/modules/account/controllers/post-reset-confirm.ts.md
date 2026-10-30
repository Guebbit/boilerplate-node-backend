---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 6eff640b228e8480e7545e4280cc7102904c5cfb9def271b6cdcaabbd88d3af6
generated_at: 2026-10-29T02:32:04.375298+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Controller for `POST /account/password/reset/confirm`. Receives a one-time reset token (delivered via email link) plus a new password, delegates the atomic token-spend and password-set to the account service, and on success destroys the session cookie and returns 204.

## Key elements

- **`postResetConfirm`** (exported) — The sole handler. Parses the body with the `ConfirmPasswordResetBody` zod schema, then calls `accountService.completePasswordReset(token, password, passwordConfirm, callerContext)`. On refusal it records a failure metric; on success it destroys the session cookie and sends a 204. All errors are funnelled through `catchAs(response, 'postResetConfirm')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.completePasswordReset`; all validation order and the atomic token-spend live in that service method.
- **`src/modules/account/session/cookies.ts`** — Calls `destroySessionCookie(response)` after a confirmed reset to invalidate any existing session.
- **`src/modules/account/metrics.ts`** — Increments `authPasswordResetConfirmTotal` with a `status` label (`success` | `failure`) on every terminal path.
- **`src/infrastructure/http/controller.ts`** — Uses `parseBody`, `refused`, and `catchAs` helpers for body validation, result-to-response mapping, and error serialization.
- **`src/infrastructure/http/request.ts`** — Uses `callerContextOf(request)` to extract caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — Uses `noContentResponse` to emit the 204.
- **`src/types/index.ts`** — Imports the `PasswordResetConfirmRequest` type for the Express generics on the request body.
- **`src/modules/account/routes.ts`** — Wires this handler to the `POST /account/password/reset/confirm` route.

## Notes

- The token is described in a comment as coming from the URL in the email, but it is actually part of the JSON body (validated by `ConfirmPasswordResetBody`). Treat the body as the source of truth.
- The service (`completePasswordReset`) guarantees that a refused/invalid password **cannot** consume the one-time token; the controller does no additional pre-check.
- There is no separate `try/catch` around the service call beyond the `.catch()` on the promise — the `catchAs` helper handles both expected rejections and unexpected throws with a single metric + response path.
