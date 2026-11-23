---
source: src/modules/account/controllers/post-email-change-resend.ts
source_sha256: b7b4cba13b03482dc2f1d60252bbe0b21f47a7c0d1d64c0dd5703fc8e06d3560
context_sha256: 35382f0d827ad11064190fc5a24ae13555fce8d66f4f999fc65ea0ea25a084aa
generated_at: 2026-11-22T03:24:13.668364+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-email-change-resend.ts

## Purpose
Express controller for `POST /account/email-change/resend`. It is a thin HTTP adapter over `accountService.resendPendingEmailVerificationFor`. It mails the pending new email address a fresh verification link and answers with the seconds to wait before another resend, mirroring `POST /account/email-verification/resend`.

## Key elements
- `postPendingEmailResend(request, response)` is the only export. It does the following:
  - Reads the user `id` from `request.authContext!`.
  - Calls `accountService.resendPendingEmailVerificationFor(id, callerContextOf(request))`.
  - Stops if `refused(response, result)` reports a refusal. Otherwise it sends `successResponse(response, result.data, result.status)`.
  - Routes any rejected promise to `catchAs(response, 'postPendingEmailResend')`.

## Relationships
- `src/infrastructure/http/controller.ts` provides `refused`, which short-circuits on a refused service result, and `catchAs`, which is the error handler labelled with the controller name.
- `src/infrastructure/http/request.ts` provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` provides `successResponse`, which writes the success payload and status.
- `src/modules/account/services/index.ts` exports `accountService`, which holds the actual resend logic.
- `src/modules/account/routes.ts` is the route registration that exposes this handler, behind the `isAuth` middleware.

## Notes
- `authContext` is read with a non-null assertion. This relies on the `isAuth` middleware having run first, so the handler must not be mounted without it.
- Having no pending email change is not an error. The documented behavior is a successful answer with `resendAfter` 0.
- The handler holds no business logic. Status codes and data come from the service result.
