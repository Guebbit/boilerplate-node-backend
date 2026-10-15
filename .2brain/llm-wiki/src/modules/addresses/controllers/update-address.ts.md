---
source: src/modules/addresses/controllers/update-address.ts
sha256: fdbadca73990aa3f4cf8956cf7a6d5f1b373cce7a154361e1006b44f34f289be
generated_at: 2026-10-15T10:17:38.856774+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/update-address.ts

## Purpose

Thin controller layer for the two address-mutation endpoints (`PUT` for full replace, `PATCH` for partial merge) at `/account/addresses/:addressId`. It delegates all business logic to the `addressUpdate` service and relies on the shared `createUpdateController` factory to wire up validation, error mapping, and response shaping.

## Key elements

- **`replaceAddress`** – Exported `PUT` handler; accepts a `ReplaceAddressBody` and fully replaces the target address.
- **`updateAddress`** – Exported `PATCH` handler; accepts an `UpdateAddressBody` and merges the provided fields into the existing address.
- Both are produced by a single `createUpdateController({ … })` call. Notable options:
  - `versioned: false` – no version header negotiation.
  - `idParam: 'addressId'` – overrides the factory's default `:id` to match the route's `:addressId` param.
  - `notFoundKey: 'addresses.not-found'` – i18n key used for the 404 response.
  - `present` is the identity function, so the service's return value is passed straight to the client.
  - `update` calls `addressUpdate(request.authContext!.id, id, changes)`, threading the authenticated user id for ownership checks.

## Relationships

- **`create-update-controller.ts`** – Provides the `createUpdateController` factory that this file destructures into `replace`/`update` handlers. All routing, validation, and error-mapping mechanics live there; this file only supplies the entity name, schemas, `idParam`, and the two callbacks (`update`, `present`).
- **`service.ts`** – Source of `addressUpdate`, the sole business-logic call. The service performs ownership verification and the actual write; the controller never touches persistence directly.
- **`routes.ts`** – Consumes the `replaceAddress` and `updateAddress` exports to register the `PUT` and `PATCH` routes under the `/account/addresses/:addressId` path.

## Notes

- Ownership is enforced in the **service**, not here. A foreign `addressId` and a genuinely missing one both yield the same 404 (`addresses.not-found`), intentionally so the endpoint doesn't leak whether an id belongs to another user.
- The `authContext` is non-null-asserted (`request.authContext!.id`); the auth middleware is expected to have already run upstream of this controller.
- Because `present` is identity, the response body is whatever shape `addressUpdate` returns—no mapping or projection happens at the controller level.
