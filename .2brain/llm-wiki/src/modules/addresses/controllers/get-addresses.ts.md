---
source: src/modules/addresses/controllers/get-addresses.ts
source_sha256: e1f7104f73d67d25a2d6efa786400fd677bcc0a133d172aa597dd107f6ca078a
context_sha256: fc4d56a8d7e4827d36f198b591f5dde90d164b900be725fc887f89654154e29a
generated_at: 2026-11-22T04:12:48.689933+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose
Controller for `GET /account/addresses`. It is a thin HTTP adapter that returns the caller's whole address book by making a single call to `addressService.list`.

## Key elements
- `getAddresses(request, response)`: the exported Express handler.
  - Reads the user `id` from `request.authContext!`, which is non-null because the `isAuth` middleware guarantees it.
  - Calls `addressService.list(id)`.
  - On success, sends the resulting view with `successResponse<AddressesResponse>`.
  - On failure, `.catch(catchAs(response, 'listAddresses'))` handles the error.

## Relationships
- `src/modules/addresses/service.ts` (imported as `../service`): exports `addressService`, whose `list` method does the actual work.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which formats the success reply.
- `src/infrastructure/http/controller.ts`: provides `catchAs`, the shared error handler, tagged with the label `'listAddresses'`.
- `src/types/index.ts` (imported as `@types`): provides the `AddressesResponse` type used for the response payload.
- `src/modules/addresses/routes.ts`: the routes module that wires this handler to the endpoint. The handler relies on `isAuth` having run before it.

## Notes
- The returned view is the whole address book. According to the file's doc comment, the post, update and delete controllers (`./post-address.ts`, `./update-address.ts`, `./delete-address.ts`) answer with the same whole-book view. Clients therefore don't need to re-fetch after a change.
- The handler returns the promise chain rather than being `async`.
