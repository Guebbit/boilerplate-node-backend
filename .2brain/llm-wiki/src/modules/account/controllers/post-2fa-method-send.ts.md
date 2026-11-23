---
source: src/modules/account/controllers/post-2fa-method-send.ts
source_sha256: 45a36c2e738fab244f8b18ffc4d48133eea5f1e427a43bbd10ca62db8444ffd4
context_sha256: 47a64b4a4a9f75a4b86488cef2ed60755b2170206a6d0efc5ac0601e0a8ec293
generated_at: 2026-11-22T03:23:37.654620+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-method-send.ts

## Purpose
Thin HTTP controller for `POST /account/2fa/methods/{method}/send`. It mails the signed-in caller a code for one armed, delivered 2FA method, so someone holding only that factor can prove possession before changing their factors. It validates the path parameter and delegates to `twoFactorService.sendMethodCode`.

## Key elements
- `post2faMethodSend(request, response)`: the exported Express handler.
  - Reads the caller's `id` from `request.authContext!`.
  - Validates `request.params` with `SendTwoFactorMethodCodeParams` (from `@api/schemas.zod`) via `parseBody`. It returns early if validation fails.
  - Calls `twoFactorService.sendMethodCode(id, method, callerContextOf(request))`.
  - If `refused(response, result)` is true, it returns without further output. Otherwise it responds `200` with `successResponse<TwoFactorDelivery>(response, result.data, 200)`.
  - Errors go to `catchAs(response, 'post2faMethodSend')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation failure, service refusals and error mapping.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: provides `successResponse` for the 200 reply.
- `src/modules/account/services/index.ts`: provides `twoFactorService`, which holds the business logic.
- `src/types/index.ts`: provides the `TwoFactorDelivery` type for the response payload.
- `src/modules/account/routes.ts`: the route that mounts this handler. Per the doc comment, the route supplies the guards.

## Notes
- The handler does no authorization or rate limiting itself. The doc comment says fresh critical auth and the per-account delivery budget are the route's own guards.
- It relies on `request.authContext` being set by upstream middleware, since it uses a non-null assertion.
- The handler is not `async`. It returns a promise chain and uses `.catch` for errors.
