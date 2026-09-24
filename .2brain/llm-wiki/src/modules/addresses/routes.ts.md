---
source: src/modules/addresses/routes.ts
sha256: 6df79afb51cfa1b8e3716ad342a1ad002d16b1182ee0230ae06c015987b3988e
generated_at: 2026-09-23T18:21:16.935194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose

Defines the Express router for the address book (CRUD on `/account/addresses`). It exists as a separate module so that address-related routes can be mounted alongside the `account` module's own router without coupling their internals.

## Key elements

- **`router`** (exported) — the `express.Router()` instance; all address-book routes are registered on it.
- **Middleware chain** — `getAuth` (resolves the auth context if not already present) then `noStore` (prevents response caching) are applied to every route on this router.
- **`GET /addresses`** — delegates to `getAddresses` controller.
- **`POST /addresses`** — delegates to `postAddress` controller.
- **`PUT /addresses/:addressId`** — delegates to `putAddress` controller.
- **`DELETE /addresses/:addressId`** — delegates to `deleteAddress` controller.
- All four routes additionally require `isAuth` (per-route guard), so unauthenticated requests are rejected before reaching a controller.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth` (router-level, idempotent) and `isAuth` (per-route guard). The kernel already runs `getAuth` globally; this file re-applies it safely because `getAuth` short-circuits when an auth context is already resolved.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`, applied router-wide to ensure no browser/CDN caches address data.
- **`src/modules/addresses/controllers/get-addresses.ts`** — implements the `GET` handler.
- **`src/modules/addresses/controllers/write-addresses.ts`** — implements `POST` (`postAddress`) and `PUT` (`putAddress`) handlers.
- **`src/modules/addresses/controllers/delete-address.ts`** — implements the `DELETE` handler.
- **`src/modules/addresses/module.ts`** — mounts this `router` under the `/account` prefix, splitting address routes from the account module's own router.
- **`src/modules/addresses/tests/unit/routes.test.ts`** — unit-tests the route wiring and middleware order defined here.
- **`tests/support/routed-modules.ts`** — registers this router in the shared test app for integration tests.

## Notes

- `getAuth` is intentionally applied both here and in the kernel middleware. This is safe (it returns early when the context is already set) but means the cost is a single no-op check per request — not a redundant auth lookup.
- `noStore` is a deliberate choice for identity-adjacent data, mirroring the same decision in the account module's router. Do not remove it "for performance" without re-evaluating the caching policy for credential-like data.
- The split between this file and the account module's routes is documented in `docs/modules/account.md`; keep the two routers in sync when adding new cross-cutting middleware.
