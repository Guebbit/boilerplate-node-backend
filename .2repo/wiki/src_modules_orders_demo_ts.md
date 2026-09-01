# src/modules/orders/demo.ts

## Purpose

Provides the demo (seed) dataset for the orders collection. Each fixture is a concrete order that demonstrates a specific real-world case (stale email, free shipping, soft-deletion on a non-admin). Product data is looked up live from the catalogue via `seedProductById` rather than restated, so the snapshot always mirrors the current product row unless a fixture explicitly overrides a field.

## Key elements

- **`snapshotOf(productId)`** – Reshapes a live catalogue row (from `@modules/products/demo`) into the `OrderSnapshotInput` shape an order item stores. Throws if the product is absent from the demo catalogue.
- **`line(productId, quantity)`** – Composes one order line: a product snapshot plus a quantity.
- **`orderFixtures`** *(exported)* – Array of three `makeOrder(...)` fixtures, each exercising a distinct case: (1) admin order with a stale email and an out-of-stock item, (2) admin order with shipping columns (free standard delivery), (3) soft-deleted order on the non-admin account.
- **`seedOrdersCollection()`** *(exported)* – Upserts every fixture via `upsertById(orderRepository, order)`; returns `SeedOutcome[]`. Called by `db/demo/index.ts`.
- **`exportSeededOrders()`** *(exported)* – Serialises the seeded documents through `orderModel` (so `applyOrderTransform` derives `totalItems`, `totalQuantity`, `totalPrice`) and returns them under the `orders` key, matching the API response shape.

## Relationships

- **`@modules/products/demo`** – Calls `seedProductById` and reads `SEED_PRODUCT_IDS` to build snapshots; does not restate product fields.
- **`@kernel/seed-accounts`** – Imports `SEED_ADMIN_ID`, `SEED_ADMIN_EMAIL`, `SEED_USER_ID`, `SEED_USER_EMAIL` for fixture identity; no registry edge on a `users` module.
- **`./fixtures`** – Imports `makeOrder` and the `OrderSnapshotInput` type.
- **`./model`** – Imports `orderModel`, used by `exportSeededOrders` for serialisation.
- **`./repository`** – Imports `orderRepository`, passed to `upsertById`.
- **`@infrastructure/persistence/seed`** – Uses `upsertById`, `exportCollection`, and the `SeedOutcome` type.
- **`./module.ts`** – Declares `seedOrdersCollection` in the module's seed registry.
- **`src/modules/inventory/service.ts` / `src/modules/cart/services/checkout.ts`** – Not imported; the absence of a `reserveForOrder` call is deliberate (see Notes).

## Notes

- **No reservation is seeded.** The seeder runs all modules concurrently; calling `reserveForOrder` would race with `products/demo.ts` writing the same product document. All seeded products therefore have `reserved: 0`.
- **Soft-deleted fixture date inconsistency is intentional.** The `deletedAt` timestamp is earlier than the `createdAt` encoded in the order ID. Nothing in the codebase reads both fields together; only the *presence* of `deletedAt` matters for queries.
- **Shipping address is restated, not imported.** The `shippingAddress` object duplicates the admin's default address from `account/demo.ts` because the orders module declares no dependency edge on the account module.
- **Derived totals are not stored.** `totalItems`, `totalQuantity`, and `totalPrice` are computed by `applyOrderTransform` at serialisation time; they appear in `exportSeededOrders` output but in no fixture field.
- **Lookup, not copy.** If a `SEED_PRODUCT_IDS` entry is removed from `products/demo.ts`, `snapshotOf` throws at seed time rather than silently omitting the line.
