---
source: src/modules/account/controllers/post-reauth-method-send.ts
source_sha256: 381149cf73f2aa7e2f7cd6b6a780241471ae655f74ab0f1e572aa411d1e86086
context_sha256: 47a64b4a4a9f75a4b86488cef2ed60755b2170206a6d0efc5ac0601e0a8ec293
generated_at: 2026-11-22T03:26:32.138286+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-reauth-method-send.ts

## Purpose
HTTP controller for `POST /account/reauth/methods/{method}/send`. It is a thin adapter over `accountService.sendReauthCode`. It mails an account that has no password the code it needs to pass step-up (re-authentication).

## Key elements
- `postReauthMethodSend(request, response)`: the only export, an Express handler.
  - Reads the caller's `id` from `request.authContext!`.
  - Validates `request.params` against the `SendReauthCodeParams` Zod schema (from `@api/schemas.zod`) via `parseBody`. If validation fails, it returns early.
  - Calls `accountService.sendReauthCode(id, method, callerContextOf(request))`.
  - If the result is refused, it returns. Otherwise it responds with `successResponse<TwoFactorDelivery>(response, result.data, 200)`.
  - Rejections are handled by `catchAs(response, 'postReauthMethodSend')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation, service refusals and error mapping.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 response.
- `src/modules/account/services/index.ts`: exports `accountService`, whose `sendReauthCode` does the actual work.
- `src/types/index.ts`: supplies the `TwoFactorDelivery` type for the response payload.
- `src/modules/account/routes.ts`: the route table that wires this handler to the endpoint. The handler file itself does not reference it.

## Notes
- The route has no fresh-auth guard. This is deliberate: it is the way a stale session becomes fresh. Abuse is bounded by the per-account delivery budget and the per-code cooldown, which the file's doc comment attributes to the service.
- The handler assumes `authContext` is already populated (non-null assertion), so the route must sit behind authentication middleware.
- Error handling uses a promise chain rather than `async/await`. Early returns after `parseBody` or `refused` mean the response was already sent by those helpers.
