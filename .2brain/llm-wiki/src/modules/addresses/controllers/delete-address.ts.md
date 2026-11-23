---
source: src/modules/addresses/controllers/delete-address.ts
source_sha256: bb6191a8293bddb7dca01ab5a0486b69b3efa6f56b587aeacfcc5956e7cc4ef5
context_sha256: ee25c43ca696291a439b849da047959ba13e80dfa02af57629b76c24ae15c032
generated_at: 2026-11-22T04:12:28.024575+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/controllers/delete-address.ts

## Purpose
Express controller for `DELETE /account/addresses/:addressId`. It is a thin HTTP adapter over the address service's `remove` operation. It removes a single address entry, never the whole address book, and replies with no body.

## Key elements
- `deleteAddress(request, response)`: the exported handler.
  - Reads the authenticated user's `id` from `request.authContext!`. The non-null assertion relies on the `isAuth` middleware having run.
  - Validates the `addressId` route param with `requireId`, using the `addresses.not-found` message and the param name `addressId`. If validation fails, the handler returns early, because `requireId` has already written the error response.
  - Calls the address service's `remove(id, addressId)`.
  - If `refused(response, result)` reports that a refusal was sent, the handler stops. Otherwise it sends `noContentResponse(response)`.
  - Any rejection goes to `catchAs(response, 'deleteAddress')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `refused` (handles service refusals) and `catchAs` (error handler tagged with the controller name).
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which validates the route id.
- `src/infrastructure/http/response.ts`: supplies `noContentResponse` for the success reply.
- `src/modules/addresses/service.ts`: supplies the `addressService` export, whose `remove` method does the actual deletion.
- `src/modules/addresses/routes.ts`: the route table that mounts this handler for `DELETE /account/addresses/:addressId`.

## Notes
- If the deleted address was the default, the oldest remaining entry is promoted. The doc comment attributes this to `repository.ts`, not to this controller.
- The response carries no body, so a client displaying the address book must refetch it to see where the default flag ended up.
- The handler is not `async`. It returns early with `undefined` on validation failure, and otherwise returns the promise chain.
