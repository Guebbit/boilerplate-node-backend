---
source: src/modules/addresses/routes.ts
sha256: ad8f83ade5c3e57df6f1abf5d9a918711121ff51f1a3da366967230121601e9f
generated_at: 2026-09-27T14:39:40.594587+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose

Defines the Express router for the address-book CRUD endpoints. It is mounted at `/account` alongside the account module's own router (see `module.ts`) and wires each HTTP verb to a thin controller, guarded by auth and no-cache middleware.

## Key elements

- **`router`** (exported `Router`) — the sole export; all other definitions are internal wiring.
- **Router-level middleware**
  - `getAuth` — resolves an auth context once; no-ops if one is already present from an upstream router.
  - `noStore` — sets cache headers so no intermediary caches the response.
- **Route definitions** (each guarded by `isAuth` before its controller):
  - `GET /addresses` → `getAddresses`
  - `POST /addresses` → `postAddress`
  - `PUT /addresses/:addressId` → `replaceAddress` (full replace)
  - `PATCH /addresses/:addressId` → `updateAddress` (partial merge)
  - `DELETE /addresses/:addressId` → `deleteAddress`

## Relationships

- **`src/modules/addresses/module.ts`** — mounts `router` at `/account` so the full paths become `/account/addresses…`.
- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth` (router-level) and `isAuth` (per-route guard).
- **`src/infrastructure/http/middlewares/cache.ts`** — source of `noStore`.
- **Controllers** (`get-addresses.ts`, `post-address.ts`, `update-address.ts`, `delete-address.ts`) — the handler functions referenced by each route; this file contains no business logic itself.
- **`src/modules/addresses/tests/unit/routes.test.ts`** — unit-tests the route table and middleware order.
- **`tests/support/routed-modules.ts`** — test-harness helper that mounts this router (and the account router) in an integration-test app.

## Notes

- `getAuth` is designed to be safe to mount more than once: it short-circuits when a resolved auth context already exists on the request, so the cost here is negligible.
- PUT vs PATCH is intentional: `replaceAddress` swaps the whole object; `updateAddress` merges. Don't treat them as interchangeable.
- The base path is `/account/addresses`, **not** `/addresses`. Any curl or test URL must include the `/account` prefix that `module.ts` adds.
