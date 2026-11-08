---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 6eff640b228e8480e7545e4280cc7102904c5cfb9def271b6cdcaabbd88d3af6
generated_at: 2026-11-08T04:07:18.151234+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

HTTP controller for `POST /account/password/reset/confirm`. It validates a one-time password-reset token (delivered in the reset email URL) and sets the user's new password, then tears down any existing session. All domain logic (token check, password validation, atomic spend) is delegated to the account service.

## Key elements

- **`postResetConfirm`** (exported) — The sole handler. Parses the JSON body against the `ConfirmPasswordResetBody` Zod schema, extracts `token`, `password`, and `passwordConfirm`, then calls `accountService.completePasswordReset`. On success it destroys the session cookie and returns `204 No Content`. On refusal it increments the failure metric and delegates the response to `refused`. On thrown errors it increments the failure metric and delegates to `catchAs`.
- **Metrics** — Every outcome (success / refused / thrown) increments `authPasswordResetConfirmTotal` with a `status` label (`'success'` or `'failure'`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Calls `accountService.completePasswordReset(token, password, passwordConfirm, ctx)`. All validation and the atomic token spend happen there. |
| `src/modules/account/session/cookies.ts` | Calls `destroySessionCookie(response)` after a successful reset to invalidate any prior session. |
| `src/infrastructure/http/controller.ts` | Uses `parseBody` (Zod validation), `refused` (uniform rejection response), and `catchAs` (error-to-HTTP mapping). |
| `src/infrastructure/http/request.ts` | Uses `callerContextOf(request)` to build the context object passed into the service. |
| `src/infrastructure/http/response.ts` | Uses `noContentResponse` to send the `204` on success. |
| `src/modules/account/metrics.ts` | Reads `authPasswordResetConfirmTotal` and calls `.inc` on every terminal path. |
| `src/modules/account/routes.ts` | Registers this handler for the `POST /account/password/reset/confirm` route. |
| `src/types/index.ts` | Imports `PasswordResetConfirmRequest` as the typed body shape for the Express generic. |

## Notes

- **Token location ambiguity.** The Express generic declares `token` as a *route param* (`Request<{ token?: string }, …>`), and a comment says it comes "in the url." However the code actually destructures `token` from the **parsed body** (`const { token, … } = body`). When wiring or testing the route, confirm which transport the token actually travels in.
- **Atomicity lives in the service.** The controller intentionally does *not* validate the password before calling the service. The comment and the service (`completePasswordReset`) guarantee that a refused password never burns the one-time link. Don't add pre-checks here.
- **No explicit auth guard.** This endpoint is reachable without a session cookie (the user is locked out, after all). Any abuse control must come from the token's single-use nature and rate-limiting, not from middleware on this route.
