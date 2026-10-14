---
source: src/modules/addresses/routes.ts
sha256: af92c9609afd455bda5a32d03f5e42bd6b4d0edcd59b24bb6f40f0bdbead4323
generated_at: 2026-10-14T14:53:18.750068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose

Defines and exports the Express router that wires up all address-book CRUD endpoints under the `/account` path prefix. It applies shared middlewares (auth resolution, no-cache) once and delegates each route to its dedicated controller, keeping routing concerns separate from business logic.

## Key elements

- **`router`** (exported) — The `express.Router` instance. Mounts `getAuth` and `noStore` globally, then registers six routes, each additionally gated by `isAuth`.
- **Route table**
  - `GET /addresses` → `getAddresses`
  - `POST /addresses` → `postAddress`
  - `PUT /addresses/:addressId` → `replaceAddress` (full replace)
  - `PATCH /addresses/:addressId` → `updateAddress` (partial merge)
  - `PUT /addresses/:addressId/default` → `putAddressDefault`
  - `DELETE /addresses/:addressId` → `deleteAddress`

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides `getAuth` (session resolution, applied once via `router.use`) and `isAuth` (per-route gate that 401s unauthenticated requests).
- **`src/infrastructure/http/middlewares/cache.ts`** — Provides `noStore`, applied globally so no address-book response is ever cacheable.
- **`src/modules/addresses/controllers/get-addresses.ts`** — Handler for `GET /addresses`.
- **`src/modules/addresses/controllers/post-address.ts`** — Handler for `POST /addresses`.
- **`src/modules/addresses/controllers/update-address.ts`** — Exports both `replaceAddress` (PUT) and `updateAddress` (PATCH).
- **`src/modules/addresses/controllers/put-address-default.ts`** — Handler for `PUT /:addressId/default`.
- **`src/modules/addresses/controllers/delete-address.ts`** — Handler for `DELETE /:addressId`.
- **`src/modules/addresses/module.ts`** — Consumes `router` and mounts it at `/account` alongside the account module's own router.
- **`src/modules/addresses/tests/unit/routes.test.ts`** — Unit-tests the route definitions and middleware ordering in this file.

## Notes

- The router lives under `/account`, not `/addresses`; the full path is `/account/addresses`. `module.ts` is responsible for that mount point.
- `getAuth` is idempotent: if the kernel's own `getAuth` has already resolved the context upstream, the second call returns immediately. Mounting it here is therefore zero-cost.
- `PUT` (replace) and `PATCH` (merge) are intentionally distinct verbs backed by two different controller functions from the same file (`update-address.ts`).
- The default-address pointer is modeled as a standalone action (`PUT …/default`) rather than a field on an address, because it belongs to the book as a whole.
