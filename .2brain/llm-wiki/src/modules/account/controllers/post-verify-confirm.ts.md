---
source: src/modules/account/controllers/post-verify-confirm.ts
source_sha256: 1f1a8ad3fb4491cc23ad139563b4b08e00f15c76a677e463d7a794ba419d0a12
context_sha256: 6a6ec9eba1dcb3891a1fdd2f1dc44246f33d146f1473ec9beb148577ca450e09
generated_at: 2026-11-22T03:27:38.505333+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose
Express controller for `POST /account/email-verification/confirm`. It spends a one-time email verification token (supplied in the request body) and marks the account's email as verified. The endpoint is deliberately public, like `password/reset/confirm` and `restore`: the token is the credential, not a login.

## Key elements
- `postVerifyConfirm(request, response)` — the only export. It:
  1. Validates `request.body` with `ConfirmEmailVerificationBody` (from `@api/schemas.zod`) via `parseBody`. On failure it increments the failure metric and returns, since `parseBody` is given `response`.
  2. Calls `accountService.confirmEmailVerification(parsed.token, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it records a failure and returns.
  4. Otherwise it records success and sends `noContentResponse(response)`.
  5. On a rejected promise it records a failure and delegates to `catchAs(response, 'postVerifyConfirm')(error)`.

## Relationships
- `src/infrastructure/http/controller.ts` — provides `parseBody`, `refused` and `catchAs`, which handle body validation, service-level refusals and error-to-response mapping.
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `noContentResponse` sends the success reply.
- `src/modules/account/services/index.ts` — exports `accountService`, which this controller calls to confirm the email verification; the file's doc comment says the service owns the find-then-spend of the token.
- `src/modules/account/metrics.ts` — `authEmailVerifyTotal` counter, labelled `status: 'success' | 'failure'`.
- `src/types/index.ts` — supplies the `VerifyEmailConfirmRequest` body type.
- `src/modules/account/routes.ts` — presumably mounts this handler on the route (not visible in this file).
- `src/infrastructure/adapters/logger.ts` — not used directly here.

## Notes
- Every failure path (validation, refusal, thrown error) increments `authEmailVerifyTotal` with `status: 'failure'`. Success is counted only after a non-refused result.
- The function returns the promise chain on the service path but returns `undefined` on validation failure.
- The `.catch` also covers errors thrown inside the `.then` callback.
