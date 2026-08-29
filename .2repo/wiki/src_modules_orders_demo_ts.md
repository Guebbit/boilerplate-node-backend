# src/modules/orders/demo.ts

## Purpose
Provides the order book's slice of the demo dataset: three seed orders (pickup, shipped, soft-deleted) plus the functions to write them into the collection and export them in serialized form. Exists so the demo database contains realistic order rows without any of them having gone through a live checkout.

## Key elements

- **`snapshotOf(productId)`** – Looks up a product via `seedProductById` (throws if absent) and reshapes it into the `OrderSnapshotInput` shape an order item stores.
- **`line(productId, quantity)`** – Convenience wrapper that pairs a snapshot with a quantity to form one order line.
- **`orderFixtures`** – Three `makeOrder(...)` results:
  - Admin pickup order with a deliberately stale email (`oldpsw@root.it`).
  - Admin shipped order (`shippingMethod: 'standard'`, `shippingCost: 0`, full `shippingAddress`).
  - Non-admin soft-deleted order (`deletedAt` set, `userId: SEED_USER_ID`).
- **`seedOrdersCollection()`** – Upserts all fixtures via `upsertById(orderRepository, …)`. Called by the demo seeder orchestrator.
- **`exportSeededOrders()`** – Returns the serialized orders (with derived `totalItems`, `totalQuantity`, `totalPrice`) via `exportCollection(orderModel, …)`.

## Relationships

- **`src/modules/orders/factory.ts`** – Consumes `makeOrder` and the `OrderSnapshotInput` type to build fixture objects.
- **`src/modules/orders/model.ts`** – Uses `orderModel` for the `exportSeededOrders` query.
- **`src/modules/orders/repository.ts`** – Passes `orderRepository` to `upsertById` during seeding.
- **`src/modules/orders/module.ts`** – Declares/registers `seedOrdersCollection` for the demo seeder entry-point.
- **`src/infrastructure/persistence/seed.ts`** – Supplies `upsertById`, `SeedOutcome`, and `exportCollection` used by both the seed and export paths.
- **`src/kernel/seed-accounts.ts`** – Source of the four `SEED_*` id/email constants used across all three fixtures.
- **`src/modules/products/demo.ts`** – Provides `SEED_PRODUCT_IDS` and `seedProductById`; the lookup-and-throw check for missing products lives there, not here.

## Notes

- **No seeded inventory reservation.** The seeder runs modules concurrently and the invariant is that no fixture is derived from another module's write. Reserving stock would create a race with `products/demo.ts`; the fixtures intentionally leave `reserved` at 0.
- **`shippingCost` is a frozen decision, not a rate lookup.** The shipped order stores the cost `priceShipping` computed at checkout time (here 0 because the line total exceeds the `freeAbove` threshold), not the current rate-card value.
- **Soft-delete ordering is intentionally inconsistent.** The third fixture's `deletedAt` predates its `createdAt`; nothing in the codebase reads both together, and the soft-delete branches only test field presence.
- **Email is a snapshot, not a live reference.** The module reads demo addresses from `@kernel/seed-accounts` rather than a user registry, mirroring the rule that an order remembers where it was sent and has no live dependency on `users`.
- **The stale-email fixture is load-bearing.** The first order deliberately carries an email that differs from `SEED_ADMIN_EMAIL` to demonstrate the snapshot property in the data itself rather than in a comment.
