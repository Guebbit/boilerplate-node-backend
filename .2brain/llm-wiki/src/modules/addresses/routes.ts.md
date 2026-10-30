---
source: src/modules/addresses/routes.ts
sha256: 5c40a5b02720eba49eed8ec2186e9eebc123e044d54dcafda06bce649b6ba439
generated_at: 2026-10-29T03:09:33.757717+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose

Express router that defines all HTTP routes for the user's address book (CRUD + default-address promotion). It is mounted under `/account` alongside the account module's own router (see `./module.ts`). Every route requires authentication; the whole router is marked non-cacheable because it handles credentials and identity-adjacent data.

## Key elements

- **`router`** – the single exported Express `Router` instance; all address-book endpoints are registered on it.
- **`router.use(getAuth)`** – resolves the session/auth context once per request so downstream handlers don't pay for it again.
- **`router.use(noStore)`** – sets `Cache-Control: no-store` on every response from this router.
- **Route handlers** (all guarded by `isAuth`):
  - `GET /addresses` → `getAddresses`
  - `POST /addresses` → `postAddress`
  - `GET /addresses/:addressId` → `getAddress`
  - `PUT /addresses/:addressId` → `replaceAddress` (full replace)
  - `PATCH /addresses/:addressId` → `updateAddress` (partial merge)
  - `PUT /addresses/:addressId/default` → `putAddressDefault`
  - `DELETE /addresses/:addressId` → `deleteAddress`

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – provides `getAuth` (session resolution) and `isAuth` (per-route auth gate). `getAuth` is idempotent: if the kernel router already ran it, this invocation is a no-op.
- **`src/infrastructure/http/middlewares/cache.ts`** – provides the `noStore` middleware applied router-wide.
- **`src/modules/addresses/module.ts`** – mounts this router at `/account` in parallel with the account module's own router.
- **Controllers** (`get-addresses`, `get-address`, `post-address`, `update-address`, `delete-address`, `put-address-default`) – imported here as the terminal handlers for each route.
- **`src/modules/addresses/tests/unit/routes.test.ts`** – unit-tests the route table and middleware ordering defined in this file.

## Notes

- **PUT vs PATCH semantics are intentional:** `PUT` performs a full replace (`replaceAddress`), `PATCH` merges only the sent fields (`updateAddress`). Don't collapse them.
- **`PUT /default` is an action, not a field mutation.** The "default" pointer belongs to the address *book*, not to a single address, so it lives on its own route rather than as a boolean on the address resource.
- **Auth middleware runs twice by design** (kernel router + this router). `getAuth` short-circuits if a resolved context already exists, so the second call is effectively free.
- The router is scoped to `/account/…`; it does not define its own mount path—`module.ts` handles that.
