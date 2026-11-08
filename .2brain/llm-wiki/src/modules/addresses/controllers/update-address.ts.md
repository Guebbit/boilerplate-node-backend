---
source: src/modules/addresses/controllers/update-address.ts
sha256: 1449e3dc72fefbc754db8755f260072c32e9d97b0906e970e6812c2e04d86e4d
generated_at: 2026-11-08T04:54:21.769536+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/update-address.ts

## Purpose

Builds the two HTTP handlers for address mutation — `PUT` (full replace) and `PATCH` (partial merge) on `/account/addresses/:addressId` — by delegating to the shared `createUpdateController` factory. The file exists to wire address-specific schemas, the `addressId` param name, and the service call into that generic factory without duplicating routing logic.

## Key elements

- **`replaceAddress`** — exported handler for `PUT /account/addresses/:addressId`; validates the body against `ReplaceAddressBody` and delegates to `addressService.update`.
- **`updateAddress`** — exported handler for `PATCH /account/addresses/:addressId`; validates the body against `UpdateAddressBody` and delegates to the same service method.
- **`createUpdateController` invocation** — the single destructured call that produces both handlers. Notable options: `versioned: false`, `idParam: 'addressId'` (overriding the factory's default `:id`), `notFoundKey: 'addresses.not-found'`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — supplies the `createUpdateController` factory that generates both handlers, handles validation via the passed Zod schemas, and manages the 404/400 response shape.
- **`src/modules/addresses/routes.ts`** — imports `replaceAddress` / `updateAddress` and registers them as the route handlers for the two address-mutation endpoints.
- **`src/modules/addresses/service.ts`** — provides `addressService.update(userId, addressId, changes)`, which performs ownership verification and the actual write; the controller's `update` callback passes `request.authContext!.id` as the owner check.

## Notes

- The route param is `:addressId`, **not** `:id`; the factory's default is overridden via `idParam`. Forgetting this in a copy-paste to a new controller would silently break the lookup.
- A 404 is intentionally indistinguishable between "address does not exist" and "address belongs to another user." Ownership is enforced inside the service, not in the controller, so a distinguishable error would leak id ownership.
- `versioned: false` means these endpoints skip whatever versioning middleware the factory would otherwise apply.
