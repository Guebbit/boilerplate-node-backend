# src/modules/account/controllers/write-addresses.ts

## Purpose

Holds the two address-book mutation handlers — add and edit — in one file because they share an identical three-step shape (schema-parse body → call one service method → branch on `result.success`). The read and delete handlers live elsewhere because they skip the body-parsing step and therefore don't share this shape.

## Key elements

- **`postAddress`** — `POST /account/addresses`. Parses the body against `AddAddressBody`, calls `accountService.addressAdd(id, data)`, and responds with the full book (or a 422 / error).
- **`putAddress`** — `PUT /account/addresses/:addressId`. Parses the body against `UpdateAddressBody`, calls `accountService.addressUpdate(id, addressId, data)`, and responds the same way. Returns 404 for both "not found" and "not yours" to avoid confirming another user's address id.

## Relationships

- **`@infrastructure/http/controller`** — imports the `catchAs`, `refused`, and `rejectValidation` helpers that both handlers use for uniform error/validation/exception handling.
- **`@infrastructure/http/request`** — imports `authContextOf` to extract the authenticated user id from the request.
- **`@infrastructure/http/response`** — imports `successResponse` for the happy-path reply.
- **`src/modules/account/services/index.ts`** — imports `accountService`; calls its `addressAdd` and `addressUpdate` methods.
- **`src/modules/account/routes.ts`** — the route table that binds these two exports to their HTTP methods/paths (and gates them behind `isAuth`).
- **`src/types/index.ts`** — imports the `AddressInput` and `UpdateAddressRequest` types used in the Express `Request` generics.

## Notes

- The "first address becomes default / later address claims slot only by saying so" invariants are **not** enforced here; they live in `repository.ts` (the read-modify-write owner) and are documented in `services/addresses.ts`.
- Co-location rationale mirrors `products/controllers/write-products.ts`: one shape, one file, so a shape change lands in exactly one place.
- Auth is guaranteed by the `isAuth` middleware upstream; the handler trusts `authContextOf` unconditionally.
