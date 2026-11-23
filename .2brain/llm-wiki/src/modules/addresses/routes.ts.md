---
source: src/modules/addresses/routes.ts
source_sha256: bdadbf24a8f2dc280423085552e1a0071fff36754570d0e3ea0194c63e37b3c7
context_sha256: 7db14cddcd1bb7ba77edb76e15403c895b17179bf80184ac2f4164bdba41a45c
generated_at: 2026-11-22T04:15:37.636554+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/routes.ts

## Purpose
Defines the Express router for the address book. It is mounted at `/account`, alongside the `account` module's own router. It maps each address endpoint to its controller and applies the shared middleware.

## Key elements
- `router`: the exported Express `Router`.
- `router.use(getAuth)`: resolves the session for every route. Each route then declares whether it needs auth through `isAuth`.
- `router.use(noStore)`: marks all responses non-cacheable, matching the `account` router.
- Routes (all use `isAuth`):
  - `GET /addresses` → `getAddresses`: the caller's address book.
  - `POST /addresses` → `idempotencyKey`, then `postAddress`: adds an entry.
  - `GET /addresses/:addressId` → `getAddress`: one entry of the caller's own book.
  - `PUT /addresses/:addressId` → `replaceAddress`: replaces the entry.
  - `PATCH /addresses/:addressId` → `updateAddress`: merges the fields sent.
  - `PUT /addresses/:addressId/default` → `putAddressDefault`: makes the entry the book's default.
  - `DELETE /addresses/:addressId` → `deleteAddress`: removes an entry.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: supplies `getAuth` (router-wide) and `isAuth` (per route).
- `src/infrastructure/http/middlewares/cache.ts`: supplies `noStore`.
- `src/infrastructure/http/middlewares/idempotency.ts`: supplies `idempotencyKey`, used on `POST` only.
- `src/modules/addresses/controllers/get-addresses.ts`, `get-address.ts`, `post-address.ts`, `update-address.ts` (exports `replaceAddress` and `updateAddress`), `delete-address.ts` and `put-address-default.ts`: provide the route handlers.
- `src/modules/addresses/module.ts`: the module that mounts this router; the file header points to it for the split with the `account` router.
- `src/modules/addresses/tests/unit/routes.test.ts`: the unit tests for this router.

## Notes
- `getAuth` returns early if the request already has a resolved auth context. Mounting it here as well as in the `account` router therefore costs nothing beyond the first run.
- `idempotencyKey` is placed after `isAuth` on `POST`. A retry after a lost response replays the original result instead of writing a duplicate and using up a slot of the book's cap.
- The default address is an action of its own (`PUT .../default`) and not a field on an address, because the pointer belongs to the book as a whole.
- Route order matters little here: `/addresses/:addressId/default` has a different path depth from `/addresses/:addressId`, so the two do not collide.
