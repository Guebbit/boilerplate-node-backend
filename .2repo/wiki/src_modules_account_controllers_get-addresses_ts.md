# src/modules/account/controllers/get-addresses.ts

## Purpose

Thin HTTP adapter for `GET /account/addresses`. It extracts the authenticated user's ID from the request and delegates to `accountService.addressesGet`, returning the caller's full address book. It exists as the read endpoint that write/delete controllers reuse as their "result" shape so clients never need a follow-up read.

## Key elements

- **`getAddresses(request, response)`** — The sole export. Reads `id` from `authContextOf(request)`, calls `accountService.addressesGet(id)`, and sends the view via `successResponse`. Errors are funnelled through `catchAs(response, 'getAddresses')`.

## Relationships

- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf`, which unpacks the middleware-guaranteed auth context to obtain the user ID.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-to-HTTP mapper used in the `.catch` branch.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the happy-path reply.
- **`src/modules/account/services/index.ts`** — Provides the `accountService` instance whose `addressesGet(id)` method performs the actual data retrieval.
- **`src/modules/account/routes.ts`** — Wires `getAddresses` to the `GET /account/addresses` route (with `isAuth` middleware upstream).

## Notes

- The JSDoc states that sibling controllers (`write-addresses.ts`, `delete-address.ts`) return the same whole-book view as their response, so this endpoint doubles as the canonical "post-mutation" shape. There is no partial-patch endpoint.
- Auth is assumed already resolved by `isAuth` middleware; this file does not re-check or throw on missing auth.
- The function uses `.then/.catch` rather than `async/await`, consistent with the project's controller style.
