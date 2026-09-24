---
source: src/modules/cart/module.ts
sha256: d3b30858649ae8245a1189ca2075507f1e969cc0c9f6d3947b35ff656ff2006c
generated_at: 2026-09-23T18:31:01.229389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.ts

## Purpose

Module manifest for the shopping cart. Registers the cart's routes, domain-event subscriptions, permission keys, personal-data collection, and locale path into the application's module registry so the cart participates in the app's lifecycle without the rest of the codebase needing to know its internals.

## Key elements

- **Default export** – An object satisfying `AppModule` that carries `name`, `basePath` (`/cart`), `permissions`, `routes`, `personalData`, `subscribe`, and `locales`.
- **`permissions`** – Declares a single key, `cart.self.checkout`, gating the checkout action while leaving browsing the basket keyless.
- **`routes`** – Re-exports the `router` from `./routes` under `basePath: '/cart'`.
- **`personalData.collect`** – Retrieves cart lines via `cartGet(userId)` and maps each to `{ productId, quantity }` only, deliberately omitting product name/price (catalogue data, not user data) to satisfy the shared `CartItem` contract's `additionalProperties: false`.
- **`subscribe()`** – Wires two domain-event handlers:
  - `PRODUCT_DELETED` → `productRemoveFromCartsById(productId)`
  - `USER_DELETED` → `cartDeleteByUserId(userId)`
- **`locales`** – Points to a `locales` directory alongside this file.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` type that the default export is typed against.
- **`src/kernel/events.ts`** – Supplies `onDomainEvent`, the subscription primitive used inside `subscribe()`.
- **`src/modules/cart/routes.ts`** – Provides the `router` instance mounted at `/cart`.
- **`src/modules/cart/services/index.ts`** – Barrel-exporting `cartGet`, `cartDeleteByUserId`, and `productRemoveFromCartsById` (implemented in `services/cleanup.ts` and `services/items.ts`).
- **`src/modules.ts`** – Top-level module aggregation that imports this default export to register the cart.
- **`src/modules/cart/tests/integration/service.test.ts` / `stock.test.ts`** – Integration tests exercising the service functions this module wires up.

## Notes

- The module reaches *back* to products and users only via **outbound** domain events (`PRODUCT_DELETED`, `USER_DELETED`), never by importing their services, to keep the import graph acyclic (stated in the file's docblock).
- `personalData.collect` intentionally strips product-derived fields; adding them would violate the `CartItem` OpenAPI contract (`additionalProperties: false`).
- The permission key `cart.self.checkout` is cross-checked by `tests/cross-cutting/module-permissions.test.ts` against `shared/authorization-keys.yaml`; a mismatch (key present in one file but not the other, or attributed to a missing module) causes that test to fail.
- The docblock references `docs/modules/cart.md` for longer narrative.
