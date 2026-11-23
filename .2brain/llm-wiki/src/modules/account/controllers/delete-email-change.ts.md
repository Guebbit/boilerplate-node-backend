---
source: src/modules/account/controllers/delete-email-change.ts
source_sha256: 32e90ce682932e70c79be1c86e76fa3d9b680b223f0676eb26f5e07c8f6e4bdb
context_sha256: 35382f0d827ad11064190fc5a24ae13555fce8d66f4f999fc65ea0ea25a084aa
generated_at: 2026-11-22T03:20:34.896767+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/delete-email-change.ts

## Purpose
Express controller for `DELETE /account/email-change`. It is a thin HTTP adapter that cancels a user's pending email change by delegating to `accountService.cancelPendingEmailChange`.

## Key elements
- `cancelPendingEmail(request, response)` — the only export. It reads `id` from `request.authContext!` (non-null asserted, so it assumes auth middleware has already run). It then calls `accountService.cancelPendingEmailChange(id, callerContextOf(request))`.
  - If `refused(response, result)` returns true, the handler returns and sends nothing further.
  - Otherwise it sends `noContentResponse(response)` (a 204 response).
  - Any rejected promise is handled by `catchAs(response, 'cancelPendingEmail')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `refused`, which writes the refusal response and signals that the handler should stop, and `catchAs`, which is the error handler labeled with the handler name.
- `src/infrastructure/http/request.ts` — supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — supplies `noContentResponse` for the success reply.
- `src/modules/account/services/index.ts` — supplies `accountService`, which holds the business logic.
- `src/modules/account/routes.ts` — the neighbor that would wire this handler to the route. This is not visible in this file.

## Notes
- The doc comment states that cancelling is an explicit action. Requesting the current address is a 409 rather than an implicit cancel. This status is produced through the service result and `refused`, not in this file.
- The file does not return a value from the success path. The handler returns the promise chain, which resolves to `undefined`.
- The doc comment includes a `@see` pointer to a section named "proving-an-address" in an account module doc; that document is not part of the files listed here.
