---
source: src/modules/account/controllers/post-email-change-confirm.ts
source_sha256: 38c6a38ea4934b73cd7ca622cd12fc134197f9ca24768dc6c38a4567a7ce92f8
context_sha256: 6a6ec9eba1dcb3891a1fdd2f1dc44246f33d146f1473ec9beb148577ca450e09
generated_at: 2026-11-22T03:24:08.725267+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose
Express controller for `POST /account/email-change/confirm`. It spends a one-time `email-change` token from the request body and swaps the caller's `pendingEmail` into `email`. The endpoint is deliberately public, like `verify-confirm`: the token in the body is the credential, not a login. A `'verify'` token is refused, because the two token types prove different addresses and must not do each other's work.

## Key elements
- `postEmailChangeConfirm(request, response)` — the exported handler. Flow:
  1. Validates the body with `parseBody(ConfirmEmailChangeBody, ...)`. On failure it increments the failure metric and returns, and `parseBody` has already used `response`.
  2. Calls `accountService.confirmEmailChange(parsed.token, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it increments the failure metric and returns.
  4. Otherwise it increments the success metric and sends `noContentResponse`.
  5. On a thrown or rejected error, it increments the failure metric and delegates to `catchAs(response, 'postEmailChangeConfirm')(error)`.
- The request type is `Request<unknown, unknown, VerifyEmailConfirmRequest>`. `ConfirmEmailChangeBody` is the runtime validation schema, imported from `@api/schemas.zod`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody` (schema validation), `refused` (maps a refused service result to a response), and `catchAs` (error-to-response mapping and logging).
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` supplies `noContentResponse`, the success response.
- `src/modules/account/services/index.ts` exports `accountService`, whose `confirmEmailChange` does the actual token spend and email swap.
- `src/modules/account/metrics.ts` exports the `authEmailChangeConfirmTotal` counter, labelled `status: 'success' | 'failure'`.
- `src/types/index.ts` exports the `VerifyEmailConfirmRequest` type.
- `src/modules/account/routes.ts` is where the handler is registered for the route.
- `src/infrastructure/adapters/logger.ts` is not imported here. Logging happens through `catchAs`.

## Notes
- The request body type is `VerifyEmailConfirmRequest`, not an email-change-specific name. Both this endpoint and `verify-confirm` accept `{ token }`, so orval names the type after that shared schema instead of generating a second one.
- The error status is derived, not assumed to be 500. If another account claims the new address between the request and the confirm, the save hits a unique-index refusal, which `catchAs` maps to a 409. `catchAs` also logs whichever error occurred.
- Every failure path (validation, refusal, thrown error) increments the `failure` status. Success increments `success` only after a non-refused result.
