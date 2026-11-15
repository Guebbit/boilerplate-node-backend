---
source: src/modules/addresses/controllers/update-address.ts
sha256: e24c3d55dcdc67b6a191df91a319fef33a60ccb2da8e63cb9d7ca93d9af08814
generated_at: 2026-11-14T19:18:52.411689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/update-address.ts

## Purpose

Builds the two HTTP handlers for `PUT /account/addresses/:addressId` (full replace) and `PATCH /account/addresses/:addressId` (partial merge) by calling the shared `createUpdateController` factory. The actual write and ownership check live in the addresses service; this file only wires the transport layer to it.

## Key elements

- **`replaceAddress` / `updateAddress`** — exported handler pair produced by a single `createUpdateController(...)` call, destructured as `{ replace, update }`.
- **`update` option** — `(id, changes, request) => addressService.update(request.authContext!.id, id, changes)`. Passes the caller's ID (from `authContext`) plus the target address ID and the body changes.
- **`present` option** — identity function; the service already returns the stored document, so no mapping is needed.
- **`notFoundKey: 'addresses.not-found'`** — i18n key used when the ID is absent or belongs to another user (both cases are indistinguishable by design).
- **`idParam: 'addressId'`** — overrides the factory's default `:id` to match the route param `:addressId`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — supplies the `createUpdateController` factory that produces the handler pair; this file configures it with schemas, the update callback, and presentation.
- **`src/modules/addresses/service.ts`** — the controller's `update` callback delegates to this module's exported `addressService`, which performs the ownership check and the write.
- **`src/modules/addresses/routes.ts`** — registers `replaceAddress` and `updateAddress` on the PUT/PATCH routes.

## Notes

- **No optimistic concurrency (`If-Match` is absent).** Rationale stated in-code: a single owner and a single book document mean a shared book-level version counter would cause editing address A to reject a concurrent edit to B.
- **Ownership is enforced in the service, not the controller.** A foreign `addressId` returns the same 404 as a missing one to avoid confirming that the ID belongs to another user.
- **`versioned: false`** — the response body is not wrapped in a version envelope.
- **`request.authContext!`** uses a non-null assertion; the route is expected to be behind authentication middleware that guarantees `authContext` is set.
