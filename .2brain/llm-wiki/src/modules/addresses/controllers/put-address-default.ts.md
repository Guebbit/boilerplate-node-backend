---
source: src/modules/addresses/controllers/put-address-default.ts
source_sha256: 1f38a830dc390855c261fa1e577e94885b4e89e7039853e0c17438191ceef5db
context_sha256: b73eea2b1adb4d44bb0a28adbef6fd8e6570ce26c30df27ebe3cf926d380e162
generated_at: 2026-11-22T04:13:12.745881+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/controllers/put-address-default.ts

## Purpose
Express controller for `PUT /account/addresses/:addressId/default`. It is a thin HTTP adapter that marks one address as the account's default by delegating to the address service. The request has no body, so repeating it leaves the same state (idempotent).

## Key elements
- `putAddressDefault(request, response)` — the only export. Its steps:
  - Reads the user `id` from `request.authContext!`. The non-null assertion relies on the `isAuth` middleware having run.
  - Validates `:addressId` with `requireId`. If invalid, it uses the `addresses.not-found` message key with `name: 'addressId'`, and the controller returns without calling the service.
  - Calls `addressService.setDefault(id, addressId)`.
  - If `refused(response, result)` is true, it stops. Otherwise it sends `successResponse<Address>(response, data, 200)`.
  - Rejections go to `catchAs(response, 'putAddressDefault')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `catchAs` (error handler) and `refused` (turns a refused service result into a response).
- `src/infrastructure/http/ids.ts` — supplies `requireId`, which validates the path parameter and sends a not-found response if it is invalid.
- `src/infrastructure/http/response.ts` — supplies `successResponse`, which formats the 200 reply.
- `src/modules/addresses/service.ts` — exports `addressService`; its `setDefault` method is called with the user id and address id and holds the business logic.
- `src/types/index.ts` — supplies the `Address` type for the response payload.
- `src/modules/addresses/routes.ts` — mounts this handler on the route.

## Notes
- The response contains only the newly defaulted address. The address that was previously the default is a different row and is not returned, so clients should refetch the address list.
- There is no `If-Match` handling, because the URL has no GET and a client could never hold an ETag for it.
- Idempotency comes from the design: the URI carries the whole request and there is no body (RFC 9110 §9.3.4, as cited in the source).
