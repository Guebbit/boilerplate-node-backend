---
source: src/modules/addresses/controllers/post-address.ts
source_sha256: b6b1b2b8d250dc0a3fa9c1780d970c5880939e3e2a87ab919e13c8a44a95039e
context_sha256: fc4d56a8d7e4827d36f198b591f5dde90d164b900be725fc887f89654154e29a
generated_at: 2026-11-22T04:13:00.897969+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/controllers/post-address.ts

## Purpose
Express controller for `POST /account/addresses`, which adds an entry to the user's address book. It validates the request body, delegates creation to the address service, and replies with `201` plus the created entry and a `Location` header. Sibling controllers handle edit (`./update-address.ts`), read (`./get-addresses.ts`) and removal (`./delete-address.ts`).

## Key elements
- `postAddress(request, response)` — the only export. Request is typed as `Request<unknown, unknown, CreateAddressRequest>`.
  - Reads the user `id` from `request.authContext!` (non-null assertion; relies on the `isAuth` middleware having run).
  - Validates `request.body` with `parseBody(CreateAddressBody, ...)`. If parsing fails it returns early (`parseBody` is passed `response`, so the error response is handled by that helper).
  - Calls `addressService.create(id, body)`. If `refused(response, result)` is true it returns early. Otherwise it sends `createdResponse<Address>(response, data, '/account/addresses/${data.id}')`.
  - Errors go to `.catch(catchAs(response, 'postAddress'))`.

## Relationships
- `src/infrastructure/http/controller.ts` — provides `parseBody`, `refused` and `catchAs`, which handle validation failures, service refusals and unexpected errors.
- `src/infrastructure/http/response.ts` — provides `createdResponse`, which sends the 201 and `Location`.
- `src/modules/addresses/service.ts` — exports `addressService`, whose `create` method does the work of creating the entry. The docblock points to this file for the default-address handling.
- `src/modules/addresses/routes.ts` — expected to mount this handler on the route (the route wiring is not visible in this file).
- `src/types/index.ts` — supplies the `Address` and `CreateAddressRequest` types (imported via `@types`).

## Notes
- Default-address rule (from the docblock): the first entry becomes the default automatically. A later entry claims the default only if the request says so, and the previous holder is demoted in the same write. This logic is not in this file.
- The handler returns early without a value on validation failure or refusal; the response has already been sent by the helpers.
