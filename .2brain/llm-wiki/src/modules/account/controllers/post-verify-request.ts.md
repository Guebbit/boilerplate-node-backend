---
source: src/modules/account/controllers/post-verify-request.ts
source_sha256: b9f2d07d8c867ce1747a043e0823ea51f14e7b0e428dfffd7511bee702b1540c
context_sha256: 35382f0d827ad11064190fc5a24ae13555fce8d66f4f999fc65ea0ea25a084aa
generated_at: 2026-11-22T03:27:49.024322+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-verify-request.ts

## Purpose
HTTP controller for `POST /account/email-verification/resend`. It is a thin adapter that re-sends the email verification link for the authenticated user (covering the case where the link sent at signup never arrived) by delegating to `accountService.requestEmailVerificationFor`.

## Key elements
- `postVerifyRequest(request, response)` — the only export. It reads `id` from `request.authContext`, calls `accountService.requestEmailVerificationFor(id, callerContextOf(request))`, and writes the result.
  - If `refused(response, result)` returns true, the handler stops, since the refusal response has already been handled.
  - Otherwise it calls `successResponse(response, result.data, result.status)`.
  - Any rejection is passed to `catchAs(response, 'postVerifyRequest')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `refused` (checks the service result and responds on refusal) and `catchAs` (error handler labelled with the controller name).
- `src/infrastructure/http/request.ts` — supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — supplies `successResponse` for the success reply.
- `src/modules/account/services/index.ts` — exports `accountService`, which holds the business logic that decides which states can be verified.
- `src/modules/account/routes.ts` — the route that wires this handler to the endpoint. The handler itself does not register the path.

## Notes
- The handler relies on the `isAuth` middleware having populated `request.authContext`, and reads it with a non-null assertion (`!`). Mounting it on a route without `isAuth` would fail at runtime.
- Which account states cannot be verified is decided only in the service, not in the controller. The comment gives the reason: a second caller cannot bypass that rule.
